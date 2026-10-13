import { Decimal } from 'decimal.js'
import { columnLabels, labelText, tableColumns } from './invoice-layout.ts'
import type { InvoiceParserResult, ParsedInvoice, ParsedLineItem } from '../types/parser.ts'

const Money = Decimal.clone({ precision: 50 })

export interface InvoicePage {
  page: number
  /** Visual reading order, top-to-bottom then left-to-right. */
  text: string
  /** Original PDF content stream order, used for invoice-number recovery. */
  headerText: string
  hasImages: boolean
  tables: (string | null)[][][]
  issues?: string[]
}

export function clean(value: string | null | undefined): string {
  return (value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
}

export function vietnameseNumber(value: string): Decimal {
  const normalized = clean(value).replace(/ /g, '')
  if (!/^-?\d+(?:\.\d{3})*(?:,\d+)?$/.test(normalized)) {
    throw new Error(`Unrecognized Vietnamese number: ${JSON.stringify(value)}`)
  }
  return new Money(normalized.replace(/\./g, '').replace(',', '.'))
}

function jsonNumber(value: Decimal): number {
  const result = value.toNumber()
  if (!Number.isFinite(result) || value.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Number exceeds the safe JSON numeric range')
  }
  return result
}

/** Accent-insensitive label search; capture values from the original NFC text. */
function match(pattern: string, text: string): string | null {
  const original = text.normalize('NFC')
  const searchable = original.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd')
  const found = new RegExp(pattern, 'imud').exec(searchable)
  const range = found?.indices?.[1]
  return range ? clean(original.slice(range[0], range[1])) : null
}

const H = '[ \t]*'
const COLON = `${H}(?:\\([^\\n)]*\\)${H})?[:：]?${H}`

const REQUIRED_COLON = COLON.replace('[:：]?', '[:：]')

function invoiceDate(text: string, issues: string[]): string | null {
  const value = match('(?:^|[^a-z])ngay(?:[ \t]+(?:lap|hoa don))?[ \t]*:?[ \t]*(\\d{1,2}[ \t]*(?:thang|[/.-])[ \t]*\\d{1,2}[ \t]*(?:nam|[/.-])[ \t]*\\d{4})', text)
  const parts = value?.match(/\d+/g)
  if (!parts || parts.length !== 3) return null
  const day = Number(parts[0]), month = Number(parts[1]), year = Number(parts[2])
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    issues.push('Invalid invoice date; review required')
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Parse already-extracted pages; separated from PDF I/O for deterministic tests. */
export function parseInvoicePages(pages: InvoicePage[], filename: string): InvoiceParserResult {
  const issues: string[] = []
  const items: ParsedLineItem[] = []
  let lineSum = new Money(0)
  for (const page of pages) {
    issues.push(...(page.issues ?? []))
    if (page.text.trim().length < 30 && page.hasImages) {
      issues.push(`Page ${page.page}: image with little text; OCR/review required`)
    }
    for (const table of page.tables) {
      let columns: number[] | null = null
      for (const row of table) {
        const cells = row.map(clean)
        if (cells.some((cell) => columnLabels[0]!.test(labelText(cell))) && cells.some((cell) => columnLabels[1]!.test(labelText(cell)))) {
          columns = tableColumns(cells)
          if (!columns) issues.push(`Page ${page.page}: unsupported table headers`)
          continue
        }
        if (!columns) continue
        const [stt = '', name = '', unit = '', qty = '', price = '', total = ''] = columns.map((column) => cells[column] ?? '')
        if (!/^\d+$/.test(stt) || !name) continue
        if (name === '2' && unit === '3' && qty === '4' && price === '5') continue
        try {
          const quantity = vietnameseNumber(qty), unitPrice = vietnameseNumber(price), lineTotal = vietnameseNumber(total)
          const itemNumber = Number(stt)
          if (!Number.isSafeInteger(itemNumber)) throw new Error('Item number exceeds the safe JSON numeric range')
          items.push({
            source_file: filename, page: page.page, item_no: itemNumber,
            description: name, unit, quantity: jsonNumber(quantity), unit_price: jsonNumber(unitPrice), line_total: jsonNumber(lineTotal),
            series: null, invoice_number: null,
          })
          lineSum = lineSum.plus(lineTotal)
          if (quantity.times(unitPrice).minus(lineTotal).abs().greaterThan(1)) {
            issues.push(`Page ${page.page}, item ${stt}: quantity × price differs from line total`)
          }
        } catch (error) {
          issues.push(`Page ${page.page}, item ${stt}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
  const text = pages.map((page) => page.text.normalize('NFC')).join('\n')
  const headerText = pages.map((page) => page.headerText.normalize('NFC')).join('\n')
  function amount(label: string): Decimal | null {
    const value = match(`(?:${label})${COLON}([\\d][\\d.,]*)`, text)
    if (value === null) return null
    try {
      const decimal = vietnameseNumber(value)
      jsonNumber(decimal)
      return decimal
    } catch (error) {
      issues.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
  const subtotal = amount('(?:cong|tong)(?: tien)? hang|tong tien (?:hang hoa|truoc thue)|tien hang')
  const vatRate = amount('thue suat(?: (?:gtgt|vat))?|vat rate')
  const vatAmount = amount('tien thue(?: (?:gtgt|vat))?|thue (?:gtgt|vat)|vat amount')
  const total = amount('tong[ \t]+(?:cong[ \t]+)?(?:tien[ \t]+)?thanh toan|tong cong thanh toan')
  // Do not pick the buyer's company/tax ID when the seller field is missing.
  const sellerText = text.split(/(?:Họ tên người mua|Tên (?:đơn vị(?! bán hàng)|người mua)|Đơn vị mua hàng|Người mua hàng|Buyer)/iu)[0] ?? ''
  const tax = match(`(?:ma so thue|mst|tax (?:id|code))${COLON}([\\d][\\d \t-]*)`, sellerText)
  const invoice: ParsedInvoice = {
    source_file: filename,
    invoice_date: invoiceDate(text, issues),
    series: match(`(?:ky hieu|invoice series)${COLON}([A-Z0-9]+)`, text),
    // JS \b is ASCII-only: no leading boundary before Vietnamese "Số".
    invoice_number: match(`(?:^|[^\\p{L}\\p{N}_])(?:so(?: hoa don)?|invoice (?:no|number))${REQUIRED_COLON}(\\d+)\\b`, headerText),
    seller: match(`(?:don vi ban hang|ten (?:don vi ban hang|nguoi ban)|nguoi ban|seller)${COLON}([^\\n]+)`, sellerText) ?? match('(cong ty[^\\n]+)', sellerText),
    seller_tax_id: tax?.replace(/\s/gu, '') ?? null,
    subtotal: subtotal?.toNumber() ?? null,
    vat_rate: vatRate?.toNumber() ?? null,
    vat_amount: vatAmount?.toNumber() ?? null,
    total: total?.toNumber() ?? null,
    status: 'OK', issues: '', processing_ms: 0,
  }
  for (const [key, value] of Object.entries(invoice)) {
    if (value === null) issues.push(`Missing field: ${key}`)
  }
  if (!items.length) issues.push('No line items parsed; unsupported layout or OCR required')
  if (items.length && subtotal !== null && lineSum.minus(subtotal).abs().greaterThan(1)) {
    issues.push('Sum of line totals differs from subtotal')
  }
  if (subtotal !== null && vatAmount !== null && total !== null && subtotal.plus(vatAmount).minus(total).abs().greaterThan(1)) {
    issues.push('Subtotal + VAT differs from invoice total')
  }
  invoice.status = issues.length ? 'REVIEW' : 'OK'
  invoice.issues = issues.join('; ')
  for (const item of items) {
    item.series = invoice.series
    item.invoice_number = invoice.invoice_number
  }
  return { invoice, items }
}
