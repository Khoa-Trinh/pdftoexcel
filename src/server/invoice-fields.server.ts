import '@tanstack/react-start/server-only'
import { Decimal } from 'decimal.js'
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

function match(pattern: string, text: string): string | null {
  const value = new RegExp(pattern, 'imu').exec(text)?.[1]
  return value === undefined ? null : clean(value)
}

function invoiceDate(text: string, issues: string[]): string | null {
  const parts = /Ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/iu.exec(text)
  if (!parts) return null
  const day = Number(parts[1]), month = Number(parts[2]), year = Number(parts[3])
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
        if (cells.includes('STT') && cells.some((cell) => cell.includes('Tên hàng hóa'))) {
          const indices = ['STT', 'Tên hàng hóa', 'Đơn vị', 'Số lượng', 'Đơn giá', 'Thành tiền']
            .map((label) => cells.findIndex((cell) => cell.includes(label)))
          columns = indices.every((index) => index >= 0) ? indices : null
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
    const value = match(`${label}\\s*:\\s*([\\d.,]+)`, text)
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
  const subtotal = amount('Cộng tiền hàng'), vatRate = amount('Thuế suất GTGT'), vatAmount = amount('Tiền thuế GTGT')
  const total = amount('Tổng\\s+(?:cộng\\s+)?(?:tiền\\s+)?thanh toán')
  const tax = match('Mã số thuế\\s*:\\s*([\\d \\t-]+)', text)
  const invoice: ParsedInvoice = {
    source_file: filename,
    invoice_date: invoiceDate(text, issues),
    series: match('Ký hiệu\\s*:\\s*([A-Z0-9]+)', text),
    // JS \b is ASCII-only: no leading boundary before Vietnamese "Số".
    invoice_number: match('(?:^|[^\\p{L}\\p{N}_])Số\\s*:\\s*(\\d+)\\b', headerText),
    seller: match('(?:Đơn vị bán hàng:\\s*)?(CÔNG TY[^\\n]+)', text),
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
