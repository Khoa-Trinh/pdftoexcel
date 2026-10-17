# Local verification

Verified 2026-10-13 with Nub 0.9.0 and Node 24.21.0. This is local build and
runtime verification, not a Cloudflare deployment.

- `nub run typecheck`, `nub run lint`, and `nub run test`: passed. The 19 tests
  cover Vietnamese number parsing, invoice fields, decimal reconciliation,
  generated PDFs, item layout, identifier strings, and spreadsheet row flattening.
- `nub run build`: passed with Nitro's `cloudflare_module` preset. Output contains
  `.output/server/index.mjs` and static assets in `.output/public`, including
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
- Browser check of the earlier page: selected two PDFs, added and removed a third,
  extracted four item rows, downloaded a valid XLSX, removed one file, and
  cleared the list. The main page had no horizontal overflow and there were no
  uncaught browser errors. The viewer controls have since been simplified.
- Browser check of automatic extraction: selected a short and a 100-page test PDF.
  Both started without a separate action and showed individual progress. While
  the long PDF was active, its trash button was disabled, a completed PDF could
  be removed, and another PDF could be added and extracted. No browser exceptions
  occurred.
- Browser check of the simplified viewer: two supplied PDFs extracted four rows
  automatically. The Xem Excel button filled its container; the dialog filled the
  viewport on desktop and mobile, displayed all 19 columns with vertical borders,
  and had no redundant toolbar or bottom status line. CSV was selected by default;
  CSV and XLSX both downloaded successfully. No browser exceptions or mobile page
  overflow occurred.
- Browser check of the compact viewer: the combined header was 61 px tall on desktop
  and mobile, with icon-only download and close controls. Pointer drag reordered
  rows, Space/arrow-key sorting worked, and the CSV export followed the new order.
  No browser exceptions or mobile overflow occurred.
- Browser check of row separators and tooltips: a row retained 1 px bottom borders
  on its cells while translated during a drag. The shadcn tooltips appeared on
  file selection/removal and on viewer download, close, and drag controls;
  keyboard focus also opened the viewer tooltips. No browser exceptions occurred.
- Browser check of tooltip behavior: tooltip labels were shortened to at most five
  words. The format selector opened with no tooltip over its options, and the
  drag tooltip disappeared while the row moved. Pointer and keyboard sorting,
  row borders, and CSV export order still worked without browser exceptions.
- With two long PDFs running, a third PDF stayed queued and could be removed.
  A malformed PDF showed a per-file error; retry and removal worked without
  affecting the other files.
- Vite development server served the homepage and health endpoint successfully
  using Nitro's Node preset.

The original PDFs remain outside the repository. Additional invoice layouts,
OCR, editing, and file drag-and-drop have not been verified or implemented. Cloudflare
chooses its execution location; local tests do not establish Singapore placement.
