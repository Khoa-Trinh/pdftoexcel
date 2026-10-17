import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flattenExtractionResults, spreadsheetCsv } from '../src/lib/spreadsheet.ts'
import type { ExtractionResult } from '../src/types/invoice.ts'

const result: ExtractionResult = {
  invoice: {
    id: 'invoice-1', sourceFilename: 'hóa đơn, 01.pdf', date: '2026-10-12',
    series: '1C26TXM', invoiceNumber: '00000471', supplierName: 'Công ty "Thử"',
    supplierTaxId: '0012345678', subtotal: 3_500_000, vatRate: 8,
    vatAmount: 280_000, total: 3_780_000, status: 'extracted', issues: [],
  },
  items: [
    { invoiceReference: 'invoice-1', page: 1, itemNumber: 1, description: 'Tem A', unit: 'Cái', quantity: 2, unitPrice: 100, lineTotal: 200,
      vatRate: 8, vatAmount: 16, totalWithVat: 216 },
    { invoiceReference: 'invoice-1', page: 1, itemNumber: 2, description: 'Tem B', unit: 'Cái', quantity: 3, unitPrice: 200, lineTotal: 600,
      vatRate: 8, vatAmount: 48, totalWithVat: 648 },
  ],
}

test('flattens invoice fields into every line-item row and preserves identifiers', () => {
  const rows = flattenExtractionResults([result])
  assert.equal(rows.length, 2)
  assert.equal(rows[0]?.invoiceNumber, '00000471')
  assert.equal(rows[1]?.supplierTaxId, '0012345678')
  assert.equal(rows[1]?.description, 'Tem B')
  assert.equal(rows[1]?.lineTotal, 600)
  assert.equal(rows[1]?.vatRate, 8)
  assert.equal(rows[1]?.lineVatAmount, 48)
  assert.equal(rows[1]?.lineTotalWithVat, 648)
})

test('exports each mixed VAT rate and its own tax amount in flat rows', () => {
  const mixed: ExtractionResult = {
    invoice: { ...result.invoice, vatRate: null, invoiceNumber: null, vatAmount: 18, total: 218,
      issues: [{ field: 'invoiceNumber', message: 'Invoice number not yet issued', severity: 'warning' }], status: 'needs_review' },
    items: [
      { ...result.items[0]!, lineTotal: 100, vatRate: 10, vatAmount: 10, totalWithVat: 110 },
      { ...result.items[1]!, lineTotal: 100, vatRate: 8, vatAmount: 8, totalWithVat: 108 },
    ],
  }
  const rows = flattenExtractionResults([mixed])
  assert.deepEqual(rows.map((row) => [row.vatRate, row.lineVatAmount, row.lineTotalWithVat]),
    [[10, 10, 110], [8, 8, 108]])
  assert.equal(rows[0]?.vatAmount, 18)
  const csv = spreadsheetCsv(rows)
  assert.match(csv, /Thuế suất GTGT dòng \(%\)/)
  assert.match(csv, /Tiền thuế dòng/)
  assert.match(csv, /Thành tiền sau thuế/)
})

test('keeps invoices without line items and emits Excel-friendly UTF-8 CSV', () => {
  const rows = flattenExtractionResults([{ ...result, items: [] }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.description, null)
  const csv = spreadsheetCsv(rows)
  assert.ok(csv.startsWith('\uFEFFTệp nguồn,'))
  assert.match(csv, /"hóa đơn, 01.pdf"/)
  assert.match(csv, /00000471/)
  assert.match(csv, /"Công ty ""Thử"""/)
})
