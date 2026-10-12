import '@tanstack/react-start/server-only'
import type { ExtractionResult } from '@/types/invoice'

export interface ExtractionInput {
  sourceFilename: string
  pdfBytes: Uint8Array
}

/** Server-only contract implemented by the native TypeScript adapter below. */
export interface ExtractionService {
  extract(input: ExtractionInput, options?: { signal?: AbortSignal }): Promise<ExtractionResult>
}

/** Native Node adapter; no Python process, remote parser, or fabricated data. */
export const typescriptExtractionService: ExtractionService = {
  async extract(input, options) {
    const { extractInvoice } = await import('./invoice-parser.server.ts')
    const { randomUUID } = await import('node:crypto')
    const result = await extractInvoice(input.pdfBytes, input.sourceFilename, options)
    const id = randomUUID()
    return {
      invoice: {
        id,
        sourceFilename: result.invoice.source_file,
        date: result.invoice.invoice_date,
        series: result.invoice.series,
        invoiceNumber: result.invoice.invoice_number,
        supplierName: result.invoice.seller,
        supplierTaxId: result.invoice.seller_tax_id,
        subtotal: result.invoice.subtotal,
        vatRate: result.invoice.vat_rate,
        vatAmount: result.invoice.vat_amount,
        total: result.invoice.total,
        status: result.invoice.status === 'OK' ? 'extracted' : 'needs_review',
        issues: result.invoice.issues ? result.invoice.issues.split('; ').map((message) => ({ field: null, message, severity: 'warning' as const })) : [],
      },
      items: result.items.map((item) => ({
        invoiceReference: id,
        page: item.page,
        itemNumber: item.item_no,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
      })),
    }
  },
}
