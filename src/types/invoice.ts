export type InvoiceStatus = 'pending' | 'extracted' | 'needs_review' | 'failed'

export interface InvoiceIssue {
  field: keyof Omit<Invoice, 'issues'> | null
  message: string
  severity: 'warning' | 'error'
}

/** Unknown values are null; dates use YYYY-MM-DD and VAT rates are percentages. */
export interface Invoice {
  /** Stable reference used by line items; assigned by the extraction service. */
  id: string
  sourceFilename: string
  date: string | null
  series: string | null
  invoiceNumber: string | null
  supplierName: string | null
  supplierTaxId: string | null
  subtotal: number | null
  vatRate: number | null
  vatAmount: number | null
  total: number | null
  status: InvoiceStatus
  issues: InvoiceIssue[]
}

export interface LineItem {
  invoiceReference: Invoice['id']
  /** One-based PDF page and item numbers. */
  page: number
  itemNumber: number | null
  description: string
  unit: string | null
  quantity: number | null
  unitPrice: number | null
  lineTotal: number | null
  vatRate: number | null
  vatAmount: number | null
  totalWithVat: number | null
}

export interface ExtractionResult {
  invoice: Invoice
  items: LineItem[]
}
