import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  downloadSpreadsheet,
  flattenExtractionResults,
  spreadsheetColumns,
} from '@/lib/spreadsheet'
import type { SheetFormat, SpreadsheetValue } from '@/lib/spreadsheet'
import type { SpreadsheetColumnKey } from '@/lib/spreadsheet'
import type { ExtractionResult } from '@/types/invoice'

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 })

function previewValue(value: SpreadsheetValue) {
  return typeof value === 'number' ? numberFormat.format(value) : value || '—'
}

function columnClass(key: SpreadsheetColumnKey) {
  if (key === 'sourceFilename') return 'w-72 min-w-72 whitespace-normal break-words'
  if (key === 'supplierName') return 'w-80 min-w-80 whitespace-normal break-words'
  if (key === 'description') return 'w-72 min-w-72 whitespace-normal break-words'
  if (key === 'issues') return 'w-80 min-w-80 whitespace-normal break-words'
  return 'whitespace-nowrap'
}

export function SpreadsheetPreview({ results }: { results: ExtractionResult[] }) {
  const [format, setFormat] = useState<SheetFormat>('xlsx')
  const [downloading, setDownloading] = useState(false)
  const rows = flattenExtractionResults(results)

  async function download() {
    if (rows.length === 0 || downloading) return
    setDownloading(true)
    try {
      await downloadSpreadsheet(rows, format)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <section aria-labelledby="preview-heading" className="space-y-5 border-t pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="preview-heading" className="text-2xl font-semibold">Xem trước bảng tính</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-base">
            <span className="text-muted-foreground">Định dạng</span>
            <select
              aria-label="Định dạng tệp"
              value={format}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setFormat(event.target.value as SheetFormat)}
              className="h-12 rounded-md border border-input bg-background px-4 text-base"
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </label>
          <Button type="button" variant="outline" size="lg" className="h-12 px-6 text-base" disabled={rows.length === 0 || downloading} onClick={download}>
            {downloading ? 'Đang tạo tệp…' : `Tải xuống .${format}`}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-base text-muted-foreground">Chưa có dữ liệu để xem trước.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border" role="region" aria-label="Xem trước dữ liệu xuất" tabIndex={0}>
          <table className="w-max min-w-full text-left text-base">
            <thead>
              <tr className="border-b bg-muted/50">
                {spreadsheetColumns.map((column) => (
                  <th key={column.key} scope="col" className={`${columnClass(column.key)} px-4 py-3 font-medium`}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row.sourceFilename}-${row.itemNumber ?? rowIndex}`} className="border-b last:border-0">
                  {spreadsheetColumns.map((column) => (
                    <td key={column.key} className={`${columnClass(column.key)} px-4 py-3 align-top`}>{previewValue(row[column.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
