/** JSON contract preserved from the supplied Python extract_invoice function. */
export interface ParsedInvoice {
  source_file: string
  invoice_date: string | null
  series: string | null
  invoice_number: string | null
  seller: string | null
  seller_tax_id: string | null
  subtotal: number | null
  vat_rate: number | null
  vat_amount: number | null
  total: number | null
  status: 'OK' | 'REVIEW'
  issues: string
  processing_ms: number
}

export interface ParsedLineItem {
  source_file: string
  page: number
  item_no: number
  description: string
  unit: string
  quantity: number
  unit_price: number
  line_total: number
  vat_rate: number | null
  vat_amount: number | null
  total_with_vat: number | null
  series: string | null
  invoice_number: string | null
}

export interface InvoiceParserResult {
  invoice: ParsedInvoice
  items: ParsedLineItem[]
}
