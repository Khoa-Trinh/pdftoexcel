# Local verification

Verified 2026-10-13 with Nub 0.9.0 and Node 24.21.0. This is local build and
runtime verification, not a Cloudflare deployment.

- `nub run typecheck`, `nub run lint`, and `nub run test`: passed. The 19 tests
  cover Vietnamese number parsing, invoice fields, decimal reconciliation,
  generated PDFs, item layout, identifier strings, and spreadsheet row flattening.
- `nub run build`: passed with Nitro's `cloudflare_module` preset. Output contains
  `.output/server/index.mjs` and 16 static assets in `.output/public`, including
  the application Web Worker, bundled PDF.js worker, and ExcelJS chunk.
- `nub run cf:typegen`: generated Cloudflare runtime and `ASSETS` binding types.
- `nub run verify:production`: Wrangler dry run passed. The Worker upload was
  roughly 1 MiB and did not include the Node PDF library or native canvas binary.
- Wrangler local Workers runtime: `GET /` returned HTML 200 and `GET
  /api/health` returned the exact JSON health body with status 200.
- Real browser check against Wrangler: selected the three supplied PDFs; the
  dedicated Web Worker parsed five items with the expected descriptions and
  preserved Rovin/3K leading-zero invoice numbers. No `/api/extract` or other
  invoice upload request occurred. XLSX download had the ZIP signature and the
  mobile page had no horizontal overflow. No uncaught browser errors occurred.
- Vite development server served the homepage and health endpoint successfully
  using Nitro's Node preset.

The original PDFs remain outside the repository. Additional invoice layouts,
OCR, editing, and drag-and-drop have not been verified or implemented. Cloudflare
chooses its execution location; local tests do not establish Singapore placement.
