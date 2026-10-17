import { getDocument, GlobalWorkerOptions, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseInvoicePages } from '@/lib/invoice-fields'
import type { InvoicePage } from '@/lib/invoice-fields'
import { positionedTable } from '@/lib/invoice-layout'
import type { ExtractionResult } from '@/types/invoice'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type RequestMessage = { id: number; filename: string; bytes: ArrayBuffer }
type ResponseMessage = { id: number; result: ExtractionResult } | { id: number; error: string } |
  { id: number; progress: { completed: number; total: number } }

function visualText(items: TextItem[], viewport: { transform: number[] }) {
  const positioned = items.map((item) => {
    const transform = Util.transform(viewport.transform, item.transform)
    return { text: item.str.normalize('NFC'), x: transform[4] ?? 0, y: transform[5] ?? 0, width: item.width, height: item.height }
  }).sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: { y: number; items: typeof positioned }[] = []
  for (const item of positioned) {
    let row = rows.at(-1)
    if (!row || Math.abs(row.y - item.y) > 3) {
      row = { y: item.y, items: [] }
      rows.push(row)
    }
    row.items.push(item)
  }
  return rows.map((row) => {
    let text = ''
    const sorted = row.items.sort((a, b) => a.x - b.x)
    for (const [index, item] of sorted.entries()) {
      const previous = sorted[index - 1]
      const gap = previous ? item.x - previous.x - previous.width : 0
      if (previous && gap > Math.max(1, item.height * 0.15) && !text.endsWith(' ') && !item.text.startsWith(' ')) text += ' '
      text += item.text
    }
    return text
  }).join('\n')
}

async function extract(bytes: ArrayBuffer, filename: string, onProgress: (completed: number, total: number) => void): Promise<ExtractionResult> {
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('Tệp PDF quá lớn (tối đa 4 MB).')
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-')) throw new Error('Tệp không phải là PDF hợp lệ.')
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 })
  try {
    const document = await task.promise
    if (document.numPages > 100) throw new Error('Tệp PDF vượt giới hạn 100 trang.')
    onProgress(0, document.numPages)
    const pages: InvoicePage[] = []
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      try {
        const content = await page.getTextContent()
        const items = content.items.filter((item): item is TextItem => 'str' in item)
        const viewport = page.getViewport({ scale: 1 })
        const operators = await page.getOperatorList()
        const imageOps: number[] = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject,
          OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintInlineImageXObjectGroup, OPS.paintImageMaskXObjectGroup]
        const table = positionedTable(items.map((item) => {
          const transform = Util.transform(viewport.transform, item.transform)
          return { text: item.str.normalize('NFC'), x: transform[4] ?? 0, y: transform[5] ?? 0, width: item.width, height: item.height }
        }))
        pages.push({
          page: number,
          text: visualText(items, viewport),
          headerText: items.map((item, index) => {
            const next = items[index + 1]
            if (item.hasEOL) return `${item.str}\n`
            const gap = next ? (next.transform[4] ?? 0) - (item.transform[4] ?? 0) - item.width : 0
            return `${item.str}${gap > 1 || gap < -1 ? ' ' : ''}`
          }).join(''),
          hasImages: operators.fnArray.some((operator) => imageOps.includes(operator)),
          tables: table ? [table] : [],
        })
        onProgress(number, document.numPages)
      } finally {
        page.cleanup()
      }
    }
    const parsed = parseInvoicePages(pages, filename)
    const id = crypto.randomUUID()
    return {
      invoice: {
        id, sourceFilename: filename, date: parsed.invoice.invoice_date, series: parsed.invoice.series,
        invoiceNumber: parsed.invoice.invoice_number, supplierName: parsed.invoice.seller,
        supplierTaxId: parsed.invoice.seller_tax_id, subtotal: parsed.invoice.subtotal,
        vatRate: parsed.invoice.vat_rate, vatAmount: parsed.invoice.vat_amount, total: parsed.invoice.total,
        status: parsed.invoice.status === 'OK' ? 'extracted' : 'needs_review',
        issues: parsed.invoice.issues ? parsed.invoice.issues.split('; ').map((message) => ({ field: null, message, severity: 'warning' as const })) : [],
      },
      items: parsed.items.map((item) => ({
        invoiceReference: id, page: item.page, itemNumber: item.item_no, description: item.description,
        unit: item.unit, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total,
        vatRate: item.vat_rate, vatAmount: item.vat_amount, totalWithVat: item.total_with_vat,
      })),
    }
  } finally {
    await task.destroy()
  }
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, filename, bytes } = event.data
  let response: ResponseMessage
  try {
    response = { id, result: await extract(bytes, filename, (completed, total) => {
      self.postMessage({ id, progress: { completed, total } } satisfies ResponseMessage)
    }) }
  } catch {
    response = { id, error: 'Không thể đọc PDF. Tệp có thể bị lỗi, được bảo vệ bằng mật khẩu hoặc không được hỗ trợ.' }
  }
  self.postMessage(response)
}
