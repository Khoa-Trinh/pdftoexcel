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
  const value = match('(?:^|[^a-z])ngay(?:[ \t]+(?:lap|hoa don))?(?:[ \t]*\\((?:date|day)\\))?[ \t]*:?[ \t]*(\\d{1,2}[ \t]*(?:thang|[/.-])(?:[ \t]*\\(month\\))?[ \t]*\\d{1,2}[ \t]*(?:nam|[/.-])(?:[ \t]*\\(year\\))?[ \t]*\\d{4})', text)
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
  const vatRates = new Set<string>()
  let lineVatSum = new Money(0)
  // Combined PDFs may start with payment requests or orders and end with
  // scanned attachments. Prefer pages explicitly headed as VAT invoices.
  const titledPages = pages.filter((page) => labelText(page.text).includes('hoa don gia tri gia tang'))
  const invoicePages = titledPages.length ? titledPages : pages
  if (invoicePages.every((page) => page.text.trim().length < 30) && invoicePages.some((page) => page.hasImages)) {
    issues.push('No extractable text found; scanned PDF is unsupported')
  }
  let lineSum = new Money(0)
  for (const page of invoicePages) {
    issues.push(...(page.issues ?? []))
    for (const table of page.tables) {
      let columns: number[] | null = null
      let rateIndex = -1, vatAmountIndex = -1, afterTaxIndex = -1
      for (const row of table) {
        const cells = row.map(clean)
        if (cells.some((cell) => columnLabels[0]!.test(labelText(cell))) && cells.some((cell) => columnLabels[1]!.test(labelText(cell)))) {
          columns = tableColumns(cells)
          rateIndex = cells.findIndex((cell) => /^thue suat/.test(labelText(cell)))
          vatAmountIndex = cells.findIndex((cell) => /^(?:tien thue|vat amount)/.test(labelText(cell)))
          afterTaxIndex = cells.findIndex((cell) => /^(?:thanh tien sau thue|tong tien thanh toan)/.test(labelText(cell)))
          if (!columns) issues.push(`Page ${page.page}: unsupported table headers`)
          continue
        }
        if (!columns) continue
        const [stt = '', name = '', unit = '', qty = '', price = '', total = ''] = columns.map((column) => cells[column] ?? '')
        const lineTotalIndex = columns[5]!
        const rateCell = rateIndex >= 0 ? cells[rateIndex] : cells.find((cell, index) => index > lineTotalIndex && /^\d+(?:,\d+)?%$/.test(cell ?? ''))
        const vatAmountCell = vatAmountIndex >= 0 ? cells[vatAmountIndex] : ''
        const afterTaxCell = afterTaxIndex >= 0 ? cells[afterTaxIndex] : ''
        if (!/^\d+$/.test(stt) || !name) continue
        if (name === '2' && unit === '3' && qty === '4' && price === '5') continue
        try {
          const quantity = vietnameseNumber(qty)
          const unitPrice = vietnameseNumber(price), lineTotal = vietnameseNumber(total)
          const isDiscount = /(?:chiet khau|giam gia|discount)/.test(labelText(name))
          // Discount amounts are often printed as positive numbers. Keep the
          // printed values in each item; only subtract them in reconciliation.
          const contribution = (value: Decimal) => isDiscount && value.isPositive() ? value.negated() : value
          function optionalNumber(value: string, field: string): Decimal | null {
            if (!value) return null
            try {
              const parsed = vietnameseNumber(value)
              jsonNumber(parsed)
              return parsed
            } catch {
              issues.push(`Page ${page.page}, item ${stt}: invalid ${field}`)
              return null
            }
          }
          const itemVatRate = rateCell && /^\d+(?:,\d+)?%$/.test(rateCell)
            ? vietnameseNumber(rateCell.slice(0, -1)) : null
          const itemVatAmount = optionalNumber(vatAmountCell ?? '', 'VAT amount')
          const itemTotalWithVat = optionalNumber(afterTaxCell ?? '', 'after-tax total')
          const itemNumber = Number(stt)
          if (!Number.isSafeInteger(itemNumber)) throw new Error('Item number exceeds the safe JSON numeric range')
          items.push({
            source_file: filename, page: page.page, item_no: itemNumber,
            description: name, unit, quantity: jsonNumber(quantity), unit_price: jsonNumber(unitPrice), line_total: jsonNumber(lineTotal),
            vat_rate: itemVatRate ? jsonNumber(itemVatRate) : null,
            vat_amount: itemVatAmount?.toNumber() ?? null,
            total_with_vat: itemTotalWithVat?.toNumber() ?? null,
            series: null, invoice_number: null,
          })
          lineSum = lineSum.plus(contribution(lineTotal))
          if (itemVatRate) vatRates.add(itemVatRate.toString())
          if (itemVatAmount) lineVatSum = lineVatSum.plus(contribution(itemVatAmount))
          if (quantity.times(unitPrice).minus(lineTotal).abs().greaterThan(1)) {
            issues.push(`Page ${page.page}, item ${stt}: quantity × price differs from line total`)
          }
          if (itemVatRate && itemVatAmount && lineTotal.times(itemVatRate).div(100).minus(itemVatAmount).abs().greaterThan(1)) {
            issues.push(`Page ${page.page}, item ${stt}: VAT rate differs from VAT amount`)
          }
          if (itemVatAmount && itemTotalWithVat && lineTotal.plus(itemVatAmount).minus(itemTotalWithVat).abs().greaterThan(1)) {
            issues.push(`Page ${page.page}, item ${stt}: pre-tax total + VAT differs from after-tax total`)
          }
        } catch (error) {
          issues.push(`Page ${page.page}, item ${stt}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
  const text = invoicePages.map((page) => page.text.normalize('NFC')).join('\n')
  const headerText = invoicePages.map((page) => page.headerText.normalize('NFC')).join('\n')
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
  // On extended VAT tables, the final summary prints subtotal, VAT and total
  // on one line. A label-only search would mistake the first for the total.
  let summary: [Decimal, Decimal, Decimal] | null = null
  for (const line of text.split('\n')) {
    const normalized = labelText(line)
    if (!/^(?:tong cong tien thanh toan|tong cong total amount)/.test(normalized)) continue
    const values = line.match(/\d+(?:[.,]\d+)*/g) ?? []
    if (values.length !== 3) continue
    try {
      const parsed = values.map(vietnameseNumber)
      if (parsed.every((value) => { jsonNumber(value); return true })) {
        summary = parsed as [Decimal, Decimal, Decimal]
        break
      }
    } catch { /* Another summary format; leave the ordinary field rules in place. */ }
  }
  const subtotal = summary?.[0] ?? amount('(?:cong|tong)(?: tien)? hang|tong tien (?:hang hoa|truoc thue)|tien hang')
  const vatAmount = summary?.[1] ?? amount('tien thue(?: (?:gtgt|vat))?|thue (?:gtgt|vat)|vat amount')
  const total = summary?.[2] ?? amount('tong[ \t]+(?:cong[ \t]+)?(?:tien[ \t]+)?thanh toan|tong cong thanh toan')
  const vatRate = vatRates.size > 1 ? null : vatRates.size === 1
    ? vietnameseNumber([...vatRates][0]!) : amount('thue suat(?: (?:gtgt|vat))?|vat rate')
  // Do not pick the buyer's company/tax ID when the seller field is missing.
  const sellerText = text.split(/(?:Họ tên người mua|Tên (?:đơn vị(?! bán hàng)|người mua)|Đơn vị mua hàng|Người mua hàng|Buyer)/iu)[0] ?? ''
  const tax = match(`(?:ma so thue|mst|tax (?:id|code))${COLON}([\\d][\\d \t-]*)`, sellerText)
  let seller = match(`(?:don vi ban(?: hang)?|ten (?:don vi ban(?: hang)?|nguoi ban)|nguoi ban|seller)${COLON}([^\\n]+)`, sellerText)
    ?? match('(cong ty[^\\n]+)', sellerText)
  if (seller) {
    const lines = sellerText.split('\n')
    const matchedSeller = seller
    const index = lines.findIndex((line) => line.includes(matchedSeller))
    const continuation = clean(lines[index + 1])
    if (index >= 0 && continuation.length > 10 && !continuation.includes(':') &&
      continuation === continuation.toLocaleUpperCase('vi-VN')) seller += ` ${continuation}`
  }
  const invoice: ParsedInvoice = {
    source_file: filename,
    invoice_date: invoiceDate(text, issues),
    series: match(`(?:ky hieu|invoice series)${COLON}([A-Z0-9]+)`, text),
    // JS \b is ASCII-only: no leading boundary before Vietnamese "Số".
    invoice_number: match(`(?:^|[^\\p{L}\\p{N}_])(?:so(?: hoa don)?|invoice (?:no|number))${REQUIRED_COLON}(\\d+)\\b`, headerText),
    seller,
    seller_tax_id: tax?.replace(/\s/gu, '') ?? null,
    subtotal: subtotal?.toNumber() ?? null,
    vat_rate: vatRate?.toNumber() ?? null,
    vat_amount: vatAmount?.toNumber() ?? null,
    total: total?.toNumber() ?? null,
    status: 'OK', issues: '', processing_ms: 0,
  }
  for (const [key, value] of Object.entries(invoice)) {
    if (value !== null || (key === 'vat_rate' && vatRates.size > 1)) continue
    if (key === 'invoice_number' && /chua cap so/.test(labelText(headerText))) {
      issues.push('Invoice number not yet issued')
    } else issues.push(`Missing field: ${key}`)
  }
  if (!items.length) issues.push('No line items parsed; unsupported layout or scanned PDF')
  if (items.length && subtotal !== null && lineSum.minus(subtotal).abs().greaterThan(1)) {
    issues.push('Sum of line totals differs from subtotal')
  }
  if (subtotal !== null && vatAmount !== null && total !== null && subtotal.plus(vatAmount).minus(total).abs().greaterThan(1)) {
    issues.push('Subtotal + VAT differs from invoice total')
  }
  if (vatAmount !== null && items.length > 0 && items.every((item) => item.vat_amount !== null) && lineVatSum.minus(vatAmount).abs().greaterThan(1)) {
    issues.push('Sum of line VAT amounts differs from invoice VAT')
  }
  invoice.status = issues.length ? 'REVIEW' : 'OK'
  invoice.issues = issues.join('; ')
  for (const item of items) {
    item.series = invoice.series
    item.invoice_number = invoice.invoice_number
    item.vat_rate ??= invoice.vat_rate
  }
  return { invoice, items }
}
