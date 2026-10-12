# TypeScript invoice parser

The supplied Python `extract_invoice(pdf_bytes, filename)` is ported to
`extractInvoice(pdfBytes: Uint8Array, filename = 'invoice.pdf')` in
`src/server/invoice-parser.server.ts`. Buffers are accepted as Uint8Array; input is
copied so PDF.js cannot detach caller-owned bytes. No temporary files are written.

## Implementation

- `pdf-parse` 2.4.5 detects ruled tables and returns cell arrays, replacing
  pdfplumber's table extraction. Its matching `pdfjs-dist` 5.4.296 dependency is
  declared directly because the reader uses PDF.js's public page text and
  operator APIs for visual ordering, stream ordering and image detection.
- PDF.js positions provide top-to-bottom, left-to-right seller/field text.
  Original content-stream order is retained separately for invoice-number
  recovery, as the Python version used pypdf for this purpose.
- `pdf-parse/worker` supplies the bundled worker via a data URL. There is no
  network dependency, process-working-directory lookup or browser worker asset.
  The dependency's Node canvas support is a transitive native dependency, traced
  into the Linux function; no Python interpreter is involved. Vite excludes the
  Node-only PDF packages from browser dependency optimization and leaves them
  external to development SSR so native bindings are loaded by Node. Build deployment
  artifacts on the target OS/architecture.
- Unicode is normalized to NFC. Vietnamese numbers accept dot thousands groups
  and comma decimals. Decimal.js arithmetic uses 50 significant digits internally;
  values become JSON numbers only at the output boundary. Values beyond the safe
  JSON numeric magnitude are rejected for review rather than silently corrupted.
- STT/header mapping, printed column-guide skipping, item fields, one-based PDF
  pages, leading-zero identifiers, missing-field checks and all three arithmetic
  checks are preserved. A discrepancy strictly greater than 1 triggers review.
- A short-text page containing image operators triggers OCR/review. Unsupported
  layouts and missing items also trigger review; there is no OCR fallback.
- `finally` blocks free PDF resources. Cancellation is checked between stages
  and destroys active documents; it cannot preempt synchronous CPU work.

`src/types/parser.ts` describes the preserved snake_case JSON contract: invoice
status is `OK` or `REVIEW`, `issues` is a semicolon-separated string, and
`processing_ms` records elapsed time. Items include source filename, series and
invoice number. `typescriptExtractionService` adapts it to the existing camelCase
app types and adds an invoice ID referenced by every item.

## API and CLI

```sh
nub run parse:invoice /path/to/invoice.pdf
nub run dev
curl -F 'file=@/path/to/invoice.pdf' http://127.0.0.1:3000/api/extract
```

The CLI emits the original-compatible JSON. The single-file API emits the shared
app result. It accepts multipart `file`, limits the body before multipart parsing,
and enforces 4 MiB / 100 pages. It returns 400 for missing/multiple/empty/non-PDF
files, 413 for large files, and 422 for malformed multipart, unreadable/encrypted
PDFs or excess pages. Review results are HTTP 200 with `needs_review`. Successful
responses use `Cache-Control: no-store`. The UI remains a foundation; batch
orchestration, result display/editing and Excel export are still pending.

## Differences and verification limits

Table detection engines differ: this is a port of the field and validation rules,
not a promise that PDF.js reproduces pdfplumber's cell segmentation for every PDF.
Borderless, merged or broken grids may require more layout-specific work. Table
extraction failures preserve readable headers and require review. Invalid dates
and malformed header amounts become review issues instead of crashing the whole
file. JSON number safety checks and resource limits are additional protections.

`nub run test` covers deterministic field rules and valid generated PDF bytes
with a Unicode ToUnicode font map, ruled tables, reading-order differences,
multiple pages and images. No production invoices are committed. The supplied
script mentions Rovin, 3K and Xao Minh, but their PDFs were not attached, so parity
with those specific layouts remains unverified. This port does not claim OCR or
full invoice-format coverage.

`nub run build && nub run verify:production` copies the emitted Netlify function
into an isolated temporary directory and exercises real extraction and errors
without the project's node_modules. This verifies local Node packaging, not an
actual Netlify deployment.
