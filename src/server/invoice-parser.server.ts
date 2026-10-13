import '@tanstack/react-start/server-only'
import { PDFParse } from 'pdf-parse'
import { getData } from 'pdf-parse/worker'
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js'
import { positionedTable, tableColumns } from '../lib/invoice-layout.ts'
import { parseInvoicePages } from '../lib/invoice-fields.ts'
import type { InvoicePage } from '../lib/invoice-fields.ts'
import type { InvoiceParserResult } from '../types/parser.ts'

// Embed the packaged worker: no CDN, browser worker, or cwd-relative asset path.
PDFParse.setWorker(getData())

function visualText(items: TextItem[], viewport: { transform: number[] }): string {
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
    const sorted = row.items.sort((a, b) => a.x - b.x)
    let text = ''
    for (const [index, item] of sorted.entries()) {
      const previous = sorted[index - 1]
      const gap = previous ? item.x - previous.x - previous.width : 0
      if (previous && gap > Math.max(1, item.height * 0.15) && !text.endsWith(' ') && !item.text.startsWith(' ')) text += ' '
      text += item.text
    }
    return text
  }).join('\n')
}

export interface InvoiceParseOptions {
  signal?: AbortSignal
  /** Limit applies to every page, including image-only and unsupported pages. */
  maxPages?: number
}

/** TypeScript equivalent of extract_invoice: PDF bytes in, JSON-ready data out. */
export async function extractInvoice(
  pdfBytes: Uint8Array,
  filename = 'invoice.pdf',
  options: InvoiceParseOptions = {},
): Promise<InvoiceParserResult> {
  if (!(pdfBytes instanceof Uint8Array) || !pdfBytes.byteLength) throw new TypeError('Expected non-empty PDF bytes')
  const maxPages = options.maxPages ?? 100
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new RangeError('maxPages must be a positive integer')
  options.signal?.throwIfAborted()
  const started = performance.now()
  // Copy input: PDF.js may transfer/detach the underlying buffer.
  const task = getDocument({ data: new Uint8Array(pdfBytes), isEvalSupported: false, verbosity: 0 })
  const tableParser = new PDFParse({ data: new Uint8Array(pdfBytes), isEvalSupported: false })
  const abort = () => { void task.destroy().catch(() => {}); void tableParser.destroy().catch(() => {}) }
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    const document = await task.promise
    if (document.numPages > maxPages) throw new RangeError(`PDF exceeds the ${maxPages}-page limit`)
    const pages: InvoicePage[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      options.signal?.throwIfAborted()
      const page = await document.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        const textItems = content.items.filter((item): item is TextItem => 'str' in item)
        const operators = await page.getOperatorList()
        const imageOps: number[] = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject,
          OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintInlineImageXObjectGroup, OPS.paintImageMaskXObjectGroup]
        const extracted: InvoicePage = {
          page: pageNumber,
          text: visualText(textItems, page.getViewport({ scale: 1 })),
          headerText: textItems.map((item, index) => {
            const next = textItems[index + 1]
            if (item.hasEOL) return `${item.str}\n`
            const gap = next ? (next.transform[4] ?? 0) - (item.transform[4] ?? 0) - item.width : 0
            return `${item.str}${gap > 1 || gap < -1 ? ' ' : ''}`
          }).join(''),
          hasImages: operators.fnArray.some((op) => imageOps.includes(op)),
          tables: [],
        }
        try {
          const result = await tableParser.getTable({ partial: [pageNumber] })
          extracted.tables = result.pages.find((result) => result.num === pageNumber)?.tables ?? []
        } catch {
          options.signal?.throwIfAborted()
          // Damaged/unsupported grids must not discard recoverable header text.
          extracted.issues = [`Page ${pageNumber}: table extraction failed; review required`]
        }
        if (!extracted.tables.some((table) => table.some((row) => tableColumns(row.map((cell) => cell ?? ''))))) {
          const viewport = page.getViewport({ scale: 1 })
          const fallback = positionedTable(textItems.map((item) => {
            const transform = Util.transform(viewport.transform, item.transform)
            return { text: item.str.normalize('NFC'), x: transform[4] ?? 0, y: transform[5] ?? 0, width: item.width, height: item.height }
          }))
          if (fallback) extracted.tables = [fallback]
        }
        pages.push(extracted)
      } finally {
        page.cleanup()
      }
    }
    options.signal?.throwIfAborted()
    const result = parseInvoicePages(pages, filename)
    result.invoice.processing_ms = Math.round((performance.now() - started) * 100) / 100
    return result
  } finally {
    options.signal?.removeEventListener('abort', abort)
    await Promise.allSettled([task.destroy(), tableParser.destroy()])
  }
}
