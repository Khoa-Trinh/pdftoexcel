import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInvoicePages, vietnameseNumber } from '../src/lib/invoice-fields.ts'
import { positionedTable } from '../src/lib/invoice-layout.ts'
import { extractInvoice } from '../src/server/invoice-parser.server.ts'
import { typescriptExtractionService } from '../src/server/extraction-service.server.ts'
import { fixturePdf, headers, invoiceFixture, invoiceText } from './pdf-fixture.ts'
import type { InvoicePage } from '../src/lib/invoice-fields.ts'

function page(overrides: Partial<InvoicePage> = {}): InvoicePage {
  return { page: 1, text: invoiceText, headerText: invoiceText, hasImages: false,
    tables: [[headers, ['1', 'Hàng hóa thử nghiệm', 'Cái', '2,5', '1.000,1', '2.500,25']]], ...overrides }
}

test('Vietnamese numbers use exact decimals and reject other conventions', () => {
  assert.equal(vietnameseNumber(' -1.234.567,89 ').toString(), '-1234567.89')
  assert.equal(vietnameseNumber('0,1').times(vietnameseNumber('0,2')).toString(), '0.02')
  for (const invalid of ['1,234.56', '12.34', '', 'NaN', '1e5', '1,2,3']) {
    assert.throws(() => vietnameseNumber(invalid), /Unrecognized Vietnamese number/)
  }
})

test('preserves Python JSON fields, leading zeros, decimal values and item metadata', () => {
  const result = parseInvoicePages([page()], 'hóa đơn.pdf')
  assert.equal(result.invoice.status, 'OK')
  assert.equal(result.invoice.invoice_number, '0000123')
  assert.equal(result.invoice.seller_tax_id, '0012345678')
  assert.equal(result.invoice.invoice_date, '2026-10-09')
  assert.equal(result.invoice.total, 2750.275)
  assert.deepEqual(result.items[0], { source_file: 'hóa đơn.pdf', page: 1, item_no: 1,
    description: 'Hàng hóa thử nghiệm', unit: 'Cái', quantity: 2.5, unit_price: 1000.1,
    line_total: 2500.25, vat_rate: 10, vat_amount: null, total_with_vat: null,
    series: 'C26TAA', invoice_number: '0000123' })
  assert.doesNotThrow(() => JSON.stringify(result))
})

test('normalizes decomposed Vietnamese and recovers invoice number in content order', () => {
  const result = parseInvoicePages([page({ text: invoiceText.replace('Số: 0000123', '0000123 Số:').normalize('NFD') })], 'a.pdf')
  assert.equal(result.invoice.status, 'OK')
  assert.equal(result.invoice.invoice_number, '0000123')
})

test('ignores printed column guides, preserves pages and handles reordered headers', () => {
  const result = parseInvoicePages([page({ page: 3, tables: [[
    ['Tên hàng hóa', 'STT', 'Thành tiền', 'Đơn vị', 'Đơn giá', 'Số lượng'],
    ['2', '1', '6=4x5', '3', '5', '4'],
    ['Hàng hóa thử nghiệm', '1', '2.500,25', 'Cái', '1.000,1', '2,5'],
  ]] })], 'a.pdf')
  assert.equal(result.invoice.status, 'OK')
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.page, 3)
})

test('flags missing fields, invalid calendar dates, invalid numeric cells and incomplete headers', () => {
  const result = parseInvoicePages([page({ text: 'Ngày 31 tháng 02 năm 2026', tables: [
    [headers, ['1', 'Hàng lỗi', 'Cái', '1.2', '10', '12']],
    [['STT', 'Tên hàng hóa', 'Đơn vị']],
  ] })], 'a.pdf')
  assert.equal(result.invoice.status, 'REVIEW')
  assert.equal(result.invoice.invoice_date, null)
  for (const message of ['Invalid invoice date', 'Missing field: seller', 'Unrecognized Vietnamese number', 'unsupported table headers', 'No line items']) assert.match(result.invoice.issues, new RegExp(message))
})

test('checks all three arithmetic relationships with a one-dong tolerance', () => {
  const result = parseInvoicePages([page({ tables: [[headers, ['1', 'Hàng', 'Cái', '2', '10', '25']]] })], 'a.pdf')
  for (const message of ['quantity × price differs', 'Sum of line totals differs']) assert.ok(result.invoice.issues.includes(message))
  const wrongTotal = parseInvoicePages([page({ text: invoiceText.replace('2.750,275', '2.760,275') })], 'a.pdf')
  assert.ok(wrongTotal.invoice.issues.includes('Subtotal + VAT differs'))
  const withinTolerance = parseInvoicePages([page({ text: invoiceText.replace('2.750,275', '2.751,275') })], 'a.pdf')
  assert.equal(withinTolerance.invoice.status, 'OK')
})

test('ignores image-only attachments after a text invoice but flags scanned PDFs', () => {
  const result = parseInvoicePages([page(), page({ page: 2, text: '', headerText: '', hasImages: true, tables: [] })], 'a.pdf')
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
  const scanned = parseInvoicePages([page({ text: '', headerText: '', hasImages: true, tables: [] })], 'scan.pdf')
  assert.equal(scanned.invoice.status, 'REVIEW')
  assert.match(scanned.invoice.issues, /No extractable text found/)
  assert.doesNotMatch(scanned.invoice.issues, /OCR/)
  const empty = parseInvoicePages([page({ tables: [] })], 'a.pdf')
  assert.ok(empty.invoice.issues.includes('No line items'))
})

test('oversized numeric values do not become unsafe JSON numbers', () => {
  const result = parseInvoicePages([page({ tables: [[headers, ['1', 'Hàng', 'Cái', '1', '999999999999999999', '999999999999999999']]] })], 'a.pdf')
  assert.equal(result.invoice.status, 'REVIEW')
  assert.equal(result.items.length, 0)
  assert.match(result.invoice.issues, /safe JSON numeric range/)
})

test('reads an actual Unicode PDF and ruled table without changing caller bytes', async () => {
  const bytes = invoiceFixture()
  const original = bytes.slice()
  const result = await extractInvoice(bytes, 'fixture.pdf')
  assert.deepEqual(bytes, original)
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
  assert.equal(result.invoice.seller, 'CÔNG TY THỬ NGHIỆM')
  assert.equal(result.invoice.invoice_number, '0000123')
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.description, 'Hàng hóa thử nghiệm')
  assert.ok(result.invoice.processing_ms > 0)
})

test('reads multiple actual PDF pages without flagging image-only attachments', async () => {
  const bytes = fixturePdf([{ lines: invoiceText.split('\n').map((text, i) => ({ text, x: 30, y: 950 - i * 24 })),
    table: { rows: [headers, ['1', 'Hàng', 'Cái', '2,5', '1.000,1', '2.500,25']] } }, { image: true }])
  const result = await extractInvoice(bytes)
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
})

test('adapter returns application types and stable invoice references', async () => {
  const result = await typescriptExtractionService.extract({ pdfBytes: invoiceFixture(), sourceFilename: 'a.pdf' })
  assert.equal(result.invoice.status, 'extracted')
  assert.equal(result.invoice.invoiceNumber, '0000123')
  assert.equal(result.items[0]?.invoiceReference, result.invoice.id)
  assert.deepEqual(result.invoice.issues, [])
})

test('rejects empty, malformed, oversized-page PDFs and respects cancellation', async () => {
  await assert.rejects(extractInvoice(new Uint8Array()), /non-empty PDF bytes/)
  await assert.rejects(extractInvoice(new TextEncoder().encode('not a PDF')))
  await assert.rejects(extractInvoice(fixturePdf([{}, {}]), 'a.pdf', { maxPages: 1 }), /page limit/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(extractInvoice(invoiceFixture(), 'a.pdf', { signal: controller.signal }), { name: 'AbortError' })
})

test('uses visual seller order and content-stream invoice number order', async () => {
  const lines = invoiceText.split('\n').filter((text) => !text.startsWith('Số:')).map((text, index) => ({ text, x: 30, y: 950 - 24 * index }))
  // The buyer is written first in the stream but is visually below the seller.
  lines.unshift({ text: 'CÔNG TY NGƯỜI MUA', x: 30, y: 710 })
  // The value appears before its label visually, but follows it in stream order.
  lines.push({ text: 'Số:', x: 450, y: 730 }, { text: '0000123', x: 30, y: 730 })
  const result = await extractInvoice(fixturePdf([{ lines,
    table: { rows: [headers, ['1', 'Hàng', 'Cái', '2,5', '1.000,1', '2.500,25']] },
  }]))
  assert.equal(result.invoice.seller, 'CÔNG TY THỬ NGHIỆM')
  assert.equal(result.invoice.invoice_number, '0000123')
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
})

test('matches label aliases, accents, bilingual labels and numeric dates without changing values', () => {
  const text = [
    'Tên đơn vị bán hàng: Hộ kinh doanh Thử Nghiệm', 'MST: 0012345678',
    'Ngay lap: 09/10/2026', 'Ky hieu (Series): C26TAA', 'So hoa don: 0000123',
    'Tong tien truoc thue: 2.500,25', 'Thue suat VAT: 10%',
    'Tien thue VAT: 250,025', 'Tong thanh toan: 2.750,275',
    'Tên đơn vị: CÔNG TY NGƯỜI MUA', 'Mã số thuế: 0099999999',
  ].join('\n')
  const result = parseInvoicePages([page({ text, headerText: text, tables: [[
    ['STT', 'Tên sản phẩm', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền'],
    ['1', 'Hàng hóa thử nghiệm', 'Cái', '2,5', '1.000,1', '2.500,25'],
  ]] })], 'aliases.pdf')
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
  assert.equal(result.invoice.seller, 'Hộ kinh doanh Thử Nghiệm')
  assert.equal(result.invoice.seller_tax_id, '0012345678')
  assert.equal(result.invoice.invoice_date, '2026-10-09')
  assert.equal(result.invoice.invoice_number, '0000123')
  assert.equal(result.invoice.total, 2750.275)
  assert.equal(result.items.length, 1)
})

test('does not substitute buyer fields when supplier fields are missing', () => {
  const text = invoiceText.split('\n').filter((line) => !line.startsWith('CÔNG TY') && !line.startsWith('Mã số thuế')).join('\n')
    + '\nHọ tên người mua hàng:\nTên đơn vị: CÔNG TY NGƯỜI MUA\nMã số thuế: 0099999999'
  const result = parseInvoicePages([page({ text })], 'missing-seller.pdf')
  assert.equal(result.invoice.seller, null)
  assert.equal(result.invoice.seller_tax_id, null)
  assert.equal(result.invoice.status, 'REVIEW')
})

test('extracts a borderless PDF table with centered/wrapped headings and an extra column', async () => {
  const lines = invoiceText.split('\n').map((text, index) => ({ text, x: 30, y: 950 - index * 24 }))
  lines.push(
    { text: 'STT', x: 30, y: 500 },
    { text: 'Tính chất HHDV', x: 65, y: 500 },
    { text: 'Tên hàng hóa, dịch vụ', x: 210, y: 500 },
    { text: 'Đơn vị', x: 360, y: 508 }, { text: 'tính', x: 365, y: 492 },
    { text: 'Số lượng', x: 415, y: 500 },
    { text: 'Đơn giá', x: 485, y: 500 },
    { text: 'Thành tiền', x: 570, y: 500 },
    { text: '1', x: 35, y: 470 },
    { text: 'Hàng hóa', x: 145, y: 470 },
    { text: 'Cái', x: 365, y: 470 },
    { text: '2,5', x: 440, y: 470 },
    { text: '1.000,1', x: 485, y: 470 },
    { text: '2.500,25', x: 580, y: 470 },
    { text: 'thử nghiệm', x: 145, y: 455 },
    { text: 'Cộng tiền hàng: 2.500,25', x: 380, y: 420 },
    // Footer numbers must not become items or description continuations.
    { text: '2', x: 35, y: 400 }, { text: 'Không phải hàng hóa', x: 145, y: 400 },
  )
  const result = await extractInvoice(fixturePdf([{ lines }]), 'borderless.pdf')
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.description, 'Hàng hóa thử nghiệm')
  assert.equal(result.items[0]?.quantity, 2.5)
  assert.equal(result.items[0]?.unit_price, 1000.1)
  assert.equal(result.items[0]?.line_total, 2500.25)
})

test('does not mistake a bank branch or address number for the invoice number', () => {
  const headerText = `Số tài khoản: 12345678 - Ngân hàng - Chi nhánh Số 10\nĐịa chỉ: Số 5 Đường Thử\n${invoiceText}`
  const result = parseInvoicePages([page({ headerText })], 'branch.pdf')
  assert.equal(result.invoice.invoice_number, '0000123')
})

test('keeps printed discount amounts positive while reconciling them as deductions', () => {
  const tokens = [
    ['STT', 10, 100, 20], ['Tên hàng hóa', 70, 100, 80], ['Đơn vị', 180, 100, 35],
    ['Số lượng', 230, 100, 45], ['Đơn giá', 290, 100, 40], ['Thành tiền', 350, 100, 50],
    ['Thuế suất', 420, 100, 45], ['Tiền thuế', 485, 100, 50], ['Thành tiền sau thuế', 550, 100, 90],
    ['1', 15, 130, 5], ['Cước vận chuyển', 75, 126, 90], ['Chuyến', 185, 130, 40],
    ['1', 250, 130, 5], ['199.315', 295, 130, 45], ['199.315', 355, 130, 45],
    ['8%', 430, 130, 15], ['15.945', 490, 130, 40], ['215.260', 560, 130, 45],
    ['2', 15, 155, 5], ['Chiết khấu', 75, 151, 80], ['Chuyến', 185, 155, 40],
    ['1', 250, 155, 5], ['15.056', 295, 155, 45], ['15.056', 355, 155, 45],
    ['8%', 430, 155, 15], ['1.204', 490, 155, 40], ['16.260', 560, 155, 45],
    ['Tổng cộng tiền thanh toán', 10, 180, 180],
  ].map(([text, x, y, width]) => ({ text: String(text), x: Number(x), y: Number(y), width: Number(width), height: 10 }))
  const table = positionedTable(tokens)
  assert.ok(table)
  assert.equal(table[1]?.[5], '199.315')
  assert.equal(table[1]?.[6], '8%')
  assert.equal(table[1]?.[7], '15.945')
  assert.equal(table[1]?.[8], '215.260')
  const text = [
    'Ngày (Date) 25 tháng (month) 09 năm (year) 2026', 'Ký hiệu (Serial): 1C26MHD',
    'Số (No.): 00001281', 'Tên đơn vị bán hàng: CÔNG TY THỬ NGHIỆM',
    'Mã số thuế: 0012345678', 'Tổng cộng tiền thanh toán (Grand total): 184.259 14.741 199.000',
  ].join('\n')
  const result = parseInvoicePages([page({ text, headerText: text, tables: [table] })], 'vat-columns.pdf')
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
  assert.equal(result.invoice.invoice_date, '2026-09-25')
  assert.equal(result.invoice.invoice_number, '00001281')
  assert.equal(result.invoice.seller_tax_id, '0012345678')
  assert.equal(result.invoice.subtotal, 184259)
  assert.equal(result.invoice.vat_amount, 14741)
  assert.equal(result.invoice.total, 199000)
  assert.equal(result.items.length, 2)
  assert.equal(result.items[1]?.unit_price, 15056)
  assert.equal(result.items[1]?.line_total, 15056)
  assert.equal(result.items[1]?.vat_amount, 1204)
  assert.equal(result.items[1]?.total_with_vat, 16260)
})

test('mixed invoice rates keep each item rate without triggering a review', () => {
  const text = [
    'Ngày (Date) 12 tháng (month) 09 năm (year) 2026', 'Ký hiệu: 1C26TNT',
    'Số: 0000123', 'CÔNG TY THỬ NGHIỆM', 'Mã số thuế: 0012345678',
    'Tổng cộng (Total amount): 200 18 218',
  ].join('\n')
  const result = parseInvoicePages([page({ text, headerText: text, tables: [[
    [...headers, 'Thuế suất', 'Tiền thuế', 'Thành tiền sau thuế'],
    ['1', 'Hàng 8%', 'Cái', '1', '100', '100', '8%', '8', '108'],
    ['2', 'Hàng 10%', 'Cái', '1', '100', '100', '10%', '10', '110'],
  ]] })], 'mixed.pdf')
  assert.equal(result.items.length, 2)
  assert.equal(result.invoice.vat_rate, null)
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
  assert.deepEqual(result.items.map((item) => [item.vat_rate, item.vat_amount, item.total_with_vat]),
    [[8, 8, 108], [10, 10, 110]])
  const unissued = parseInvoicePages([page({ text: text.replace('Số: 0000123', 'Số: <Chưa cấp số>'),
    headerText: text.replace('Số: 0000123', 'Số: <Chưa cấp số>'), tables: [[
      [...headers, 'Thuế suất', 'Tiền thuế', 'Thành tiền sau thuế'],
      ['1', 'Hàng 8%', 'Cái', '1', '100', '100', '8%', '8', '108'],
      ['2', 'Hàng 10%', 'Cái', '1', '100', '100', '10%', '10', '110'],
    ]] })], 'unissued.pdf')
  assert.equal(unissued.invoice.status, 'REVIEW')
  assert.equal(unissued.invoice.issues, 'Invoice number not yet issued')
})

test('uses VAT invoice pages instead of preceding payment and order pages', () => {
  const payment = page({ page: 1, text: 'GIẤY ĐỀ NGHỊ THANH TOÁN\nNgày: 13/10/2026\nSố: 24',
    headerText: 'Số: 24', tables: [] })
  const order = page({ page: 2, text: 'BẢNG KÊ ĐƠN ĐẶT HÀNG\nSố lượng: 2',
    headerText: '', tables: [[headers, ['1', 'Wrong order item', 'Cái', '1', '100', '100']]] })
  const text = [
    'HÓA ĐƠN GIÁ TRỊ GIA TĂNG', 'Ngày (day) 12 tháng (month) 10 năm (year) 2026',
    'Ký hiệu (Serial): 1C26TDP', 'Số (Invoice No.): 00005993',
    'Đơn vị bán (Seller): CÔNG TY MINH ĐẠI PHÚ', 'Mã số thuế: 0310690177',
    'Cộng tiền hàng: 100', 'Thuế suất GTGT: 10%', 'Tiền thuế GTGT: 10',
    'Tổng cộng tiền thanh toán: 110',
  ].join('\n')
  const invoice = page({ page: 3, text, headerText: text,
    tables: [[headers, ['1', 'Ống thép', 'Kg', '1', '100', '100']]] })
  const attachment = page({ page: 4, text: '', headerText: '', hasImages: true, tables: [] })
  const result = parseInvoicePages([payment, order, invoice, attachment], 'combined.pdf')
  assert.equal(result.invoice.status, 'OK', result.invoice.issues)
  assert.equal(result.invoice.invoice_date, '2026-10-12')
  assert.equal(result.invoice.invoice_number, '00005993')
  assert.equal(result.invoice.seller, 'CÔNG TY MINH ĐẠI PHÚ')
  assert.deepEqual(result.items.map((item) => [item.page, item.description]), [[3, 'Ống thép']])
})

test('keeps a description that starts above its numbered row', () => {
  const tokens = [
    ['STT', 10, 100, 20], ['Tên hàng hóa', 70, 100, 80], ['Đơn vị', 180, 100, 35],
    ['Số lượng', 230, 100, 45], ['Đơn giá', 290, 100, 40], ['Thành tiền', 350, 100, 50],
    ['Thép ống 304:', 75, 130, 80], ['1', 15, 136, 5], ['Kg', 185, 136, 20],
    ['2', 250, 136, 5], ['100', 295, 136, 25], ['200', 355, 136, 25],
    ['Phi 76 x 6000mm', 75, 142, 90],
    ['Thép thanh 316L:', 75, 170, 90], ['2', 15, 176, 5], ['Kg', 185, 176, 20],
    ['1', 250, 176, 5], ['50', 295, 176, 20], ['50', 355, 176, 20],
    ['Phi 12 x 6000mm', 75, 182, 90],
  ].map(([text, x, y, width]) => ({ text: String(text), x: Number(x), y: Number(y), width: Number(width), height: 10 }))
  const table = positionedTable(tokens)
  assert.ok(table)
  assert.deepEqual(table.slice(1).map((row) => row[1]), [
    'Thép ống 304: Phi 76 x 6000mm', 'Thép thanh 316L: Phi 12 x 6000mm',
  ])
})
