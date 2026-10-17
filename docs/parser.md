# Invoice parsing

The deployed app parses PDFs locally in a browser Web Worker. PDF.js extracts text
tokens and page coordinates; its PDF worker is bundled by Vite rather than loaded
from a CDN. `positionedTable` finds column headings and maps tokens into item
rows by position. It handles the supplied Rovin, 3K, and Xảo Minh layouts,
including wrapped headings and an extra Rovin column. Concatenated page text is
used for header labels, not as the sole source of table row order.

For extended VAT tables, the parser stops the pre-tax line-total column before
the VAT columns and reads the summary's subtotal, VAT, and payment total as
separate amounts. Each line keeps its own VAT rate, VAT amount, and after-tax
total. Printed discount rows retain their positive amounts in the export; the
reconciliation subtracts them when checking invoice totals. A mixed-rate invoice leaves the
invoice-level rate blank; each spreadsheet row shows its own rate. Mixed rates
alone do not require review. An invoice marked "Chưa cấp số" still does.

`parseInvoicePages` normalizes Unicode and recognizes Vietnamese label aliases.
When a PDF combines payment requests, orders, invoices, and scanned attachments,
it reads fields and item tables from pages headed as VAT invoices. Image-only
attachments after a readable invoice do not trigger a review warning. A PDF
with no extractable text is still marked for review because this text-only
workflow cannot read scanned invoices.
It keeps invoice numbers and tax IDs as strings. Numbers use dot thousands and
comma decimal separators: `32.000` is 32000, `109,375` is 109.375, and
`350.000,00` is 350000. Decimal.js handles arithmetic internally. Missing fields,
unrecognized tables, scanned pages, and arithmetic differences above one đồng
produce review issues. OCR is not available. Damaged or encrypted PDFs get a
per-file error, allowing the rest of a batch to finish.

Browser inputs are limited to 4 MiB per file and 100 pages; at most two files are
processed concurrently. PDF bytes never reach the Cloudflare Worker. The old Node parser
and `nub run parse:invoice` CLI remain in `src/server` for comparison with the
original Python JSON contract. They are excluded from the Cloudflare bundle.

More suppliers and unusual merged tables will need additional layout handling.
The current spreadsheet preview is read-only.
