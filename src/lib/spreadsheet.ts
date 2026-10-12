import type { ExtractionResult } from '@/types/invoice'

export type SheetFormat = 'xlsx' | 'csv'

export const spreadsheetColumns = [
  { key: 'sourceFilename', label: 'Tệp nguồn' },
  { key: 'date', label: 'Ngày hóa đơn' },
  { key: 'series', label: 'Ký hiệu' },
  { key: 'invoiceNumber', label: 'Số hóa đơn' },
  { key: 'supplierName', label: 'Nhà cung cấp' },
  { key: 'supplierTaxId', label: 'Mã số thuế' },
  { key: 'subtotal', label: 'Tiền hàng' },
  { key: 'vatRate', label: 'Thuế suất GTGT (%)' },
  { key: 'vatAmount', label: 'Tiền thuế GTGT' },
  { key: 'total', label: 'Tổng thanh toán' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'issues', label: 'Lưu ý' },
  { key: 'page', label: 'Trang' },
  { key: 'itemNumber', label: 'STT' },
  { key: 'description', label: 'Tên hàng hóa, dịch vụ' },
  { key: 'unit', label: 'Đơn vị' },
  { key: 'quantity', label: 'Số lượng' },
  { key: 'unitPrice', label: 'Đơn giá' },
  { key: 'lineTotal', label: 'Thành tiền' },
] as const

export type SpreadsheetColumnKey = typeof spreadsheetColumns[number]['key']
export type SpreadsheetValue = string | number | null
export type SpreadsheetRow = Record<SpreadsheetColumnKey, SpreadsheetValue>

export function flattenExtractionResults(results: ExtractionResult[]): SpreadsheetRow[] {
  return results.flatMap(({ invoice, items }) => {
    const invoiceValues = {
      sourceFilename: invoice.sourceFilename,
      date: invoice.date,
      series: invoice.series,
      invoiceNumber: invoice.invoiceNumber,
      supplierName: invoice.supplierName,
      supplierTaxId: invoice.supplierTaxId,
      subtotal: invoice.subtotal,
      vatRate: invoice.vatRate,
      vatAmount: invoice.vatAmount,
      total: invoice.total,
      status: invoice.status === 'needs_review' ? 'Cần kiểm tra' : 'Đã trích xuất',
      issues: invoice.issues.map((issue) => issue.message).join('; '),
    }
    const sourceItems = items.length > 0 ? items : [null]
    return sourceItems.map((item): SpreadsheetRow => ({
      ...invoiceValues,
      page: item?.page ?? null,
      itemNumber: item?.itemNumber ?? null,
      description: item?.description ?? null,
      unit: item?.unit ?? null,
      quantity: item?.quantity ?? null,
      unitPrice: item?.unitPrice ?? null,
      lineTotal: item?.lineTotal ?? null,
    }))
  })
}

function csvCell(value: SpreadsheetValue): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function spreadsheetCsv(rows: SpreadsheetRow[]): string {
  const lines = [spreadsheetColumns.map((column) => csvCell(column.label)).join(',')]
  for (const row of rows) lines.push(spreadsheetColumns.map((column) => csvCell(row[column.key])).join(','))
  return `\uFEFF${lines.join('\r\n')}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadSpreadsheet(rows: SpreadsheetRow[], format: SheetFormat) {
  // Vite removes the exporter from the SSR/Netlify bundle. Workbooks are created
  // only after a user clicks download in the browser.
  if (import.meta.env.SSR) return
  const filename = `hoa-don-${new Date().toISOString().slice(0, 10)}.${format}`
  if (format === 'csv') {
    downloadBlob(new Blob([spreadsheetCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename)
    return
  }

  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'invoice-extractor'
  const sheet = workbook.addWorksheet('Chi tiết hóa đơn', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = spreadsheetColumns.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.max(12, Math.min(42, column.label.length + 4)),
  }))
  for (const row of rows) sheet.addRow(row)
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(spreadsheetColumns.length).letter}1` }
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { vertical: 'middle' }
  for (const key of ['sourceFilename', 'supplierName', 'issues', 'description'] satisfies SpreadsheetColumnKey[]) {
    sheet.getColumn(key).width = key === 'issues' ? 42 : 30
  }
  for (const key of ['invoiceNumber', 'supplierTaxId'] satisfies SpreadsheetColumnKey[]) {
    sheet.getColumn(key).numFmt = '@'
  }
  for (const key of ['subtotal', 'vatAmount', 'total', 'quantity', 'unitPrice', 'lineTotal'] satisfies SpreadsheetColumnKey[]) {
    sheet.getColumn(key).numFmt = '#,##0.######'
  }
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}
