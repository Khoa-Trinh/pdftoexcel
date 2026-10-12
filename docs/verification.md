# Local verification

Verified 2026-10-12 on Linux x64, Node 24.21.0 and pnpm 10.34.7.

| Check | Result |
| --- | --- |
| `pnpm install` and final `pnpm install --frozen-lockfile` | Passed; lockfile matches package.json |
| `pnpm typecheck` | Passed, strict TypeScript |
| `pnpm lint` | Passed |
| `pnpm build` | Passed, Nitro netlify preset |
| Development `GET /` | HTTP 200, Vietnamese server-rendered title |
| Development `GET /api/health` | HTTP 200, application/json, exact requested body |
| Production `pnpm preview --port 3001` | Passed homepage and health checks |
| Direct generated Netlify function invocation | HTTP 200, exact health JSON |
| Production artifacts | `dist/assets` JS/CSS/local Vietnamese fonts; `.netlify/functions-internal/server/server.mjs`, `main.mjs`, chunks and metadata |
| Client bundle inspection | Health implementation/service identifier and extraction contract absent from client JS |

An isolated Playwright 1.64.0 installation outside the project used the existing
Google Chrome executable for browser verification on both dev (3000) and
production preview (3001). No browser/test dependency was added to the app.
Assertions covered:

- Vietnamese document language, heading and empty results state.
- Clicking the picker button opens a real file chooser with multiple selection.
- Selecting two PDF files lists both names and updates the live count.
- Removing either file, re-selecting it, and removing all files works.
- Re-selecting an identical filesystem file does not duplicate it.
- A non-PDF filename is rejected with a visible message. This is UI filtering,
  not server content validation; real upload validation is future work.
- Extraction and export buttons remain disabled.
- Layout fits a 390-pixel mobile viewport without horizontal overflow.
- No uncaught browser JavaScript or hydration errors.
- Health response has JSON content type and exactly
  `{"ok":true,"service":"invoice-extractor"}`.

Desktop and mobile screenshots were visually inspected. The final build retains
non-fatal dependency `MODULE_LEVEL_DIRECTIVE` warnings; the Nitro/SSR server-entry
collision warning was fixed by moving the Start entry to `src/server.ts`.

No Netlify deployment, cloud resource creation, Python execution or Excel export
was performed. These initial foundation results establish local behavior
and build output, not execution inside Netlify's deployed infrastructure.

## Nub verification

After switching the local instructions to Nub, verified with installed Nub
**0.9.0** and Node **24.21.0**:

- `nub install --frozen-lockfile`: passed; the committed pnpm lockfile was unchanged.
- `nub run typecheck`: passed.
- `nub run lint`: passed.
- `nub run build`: passed with the same documented non-fatal dependency warnings.
- `nub run dev`: homepage HTTP 200 with Vietnamese title; health returned the exact JSON.

The earlier browser checks remain recorded above. Netlify continues using its
own provisioned pnpm; standalone pnpm is not required for local development.

## TypeScript parser verification

The Python attachment was ported to native TypeScript. All checks use Nub 0.9.0
and Node 24.21.0:

- `nub install --frozen-lockfile`: passed after adding the pinned PDF/decimal dependencies.
- `nub run typecheck`, `nub run lint`: passed with parser, CLI and tests included.
- `nub run test`: 13 tests passed. Covers Vietnamese decimal syntax/arithmetic,
  leading-zero IDs, NFC normalization, header recovery, table column mapping,
  calendar dates, missing data, arithmetic discrepancies and tolerance, scans,
  unsafe numeric magnitude, actual generated Unicode PDFs and ruled tables,
  multiple pages, reading-order differences, invalid PDFs, page limits,
  pre-cancellation and mapping to shared application types.
- `nub run build`: passed using the Nitro Netlify Node preset.
- `nub run verify:production`: passed. The generated function was copied to a
  temporary directory outside the workspace before invocation, verifying that
  worker/native dependencies are packaged. Tested a valid PDF, image-only review,
  malformed and non-PDF bytes, missing/multiple/oversized uploads, and health JSON.
- `nub run parse:invoice /tmp/invoice-parser-fixture.pdf`: emitted valid
  Python-compatible JSON with `OK`, the original leading-zero identifiers, and
  the expected line item.
- Real local HTTP `POST /api/extract` with multipart `file`: HTTP 200, expected
  camelCase invoice/item data; `GET /api/health` remains correct.
- Browser homepage selection/removal checks were rerun successfully after adding
  the server endpoint; the UI remains disconnected from extraction.

Vite's initial development dependency scan attempted to optimize a native canvas
binding. Excluding Node-only PDF dependencies from browser optimization and
externalizing them in SSR resolved it; development and production were both
rechecked. Original non-fatal dependency bundling warnings remain.

No actual Rovin, 3K or Xao Minh PDFs were supplied, so extraction parity on those
specific layouts is not yet verified. No OCR, UI extraction workflow or Excel
export is claimed. No site has been deployed to Netlify.

## Frontend extraction workflow

The homepage is now connected to the real TypeScript extraction API. Verified
with Nub on 2026-10-12:

- Strict type checking, linting, all 13 parser tests, production build and isolated
  production-function verification passed.
- Browser tests uploaded multiple generated PDFs through the real endpoint and
  verified invoice identifiers with leading zeros, parsed line items and
  Vietnamese decimal formatting.
- Invalid PDFs show per-file errors without interrupting later files. Retry sends
  only failed files. Simulated network failure followed by a real retry passed.
- Picker/removal controls are disabled during processing. Removing a file removes
  its results; removing all files restores the empty state.
- Files over 4 MiB are rejected before upload. Scanned PDFs display review warnings.
- Results fit a 390-pixel viewport; line-item tables scroll within their container.
  Desktop/mobile screenshots were inspected, with no uncaught browser errors.
- Client JS inspection found no PDF engine, native canvas or invoice parser code.
- Excel export remains disabled. No cloud deployment was performed.

These checks use synthetic PDFs; actual customer invoice layouts still need
validation. Earlier disconnected-UI notes above describe the previous foundation.

## Supplied invoice layouts

Verified the three user-supplied PDFs locally on 2026-10-12. The original grid
extractor found the 3K table but missed Rovin and Xảo Minh. A heading-based
text-position fallback now recovers those rows; regex aliases support field-label
variations without supplier-name rules.

| Sample | Line items | VAT amount | Invoice total |
| --- | ---: | ---: | ---: |
| Xảo Minh, October 2026 | 1 | 280.000 | 3.780.000 |
| Rovin, April 2026 | 2 | 178.800 | 2.413.800 |
| 3K, May 2026 | 2 | 12.571.200 | 169.711.200 |

Rendered originals were inspected. Browser uploads through the real frontend/API
matched dates, series, invoice numbers, supplier tax IDs, subtotals, VAT and totals,
and every description, quantity, unit price and line total. Leading zeros were
preserved. All samples returned `extracted` with no validation issues. The mobile
results page had no horizontal page overflow or uncaught browser errors.

- All 17 parser tests, strict type checking and linting passed.
- Production build and isolated generated-function verification passed.
- The three actual PDFs also passed extraction through a copy of the emitted
  function outside the project's node_modules.
- Added synthetic regressions for label aliases, buyer/supplier separation,
  borderless tables, wrapped headings/descriptions, optional columns and bank
  branch numbers that must not become invoice numbers.

Customer PDFs and diagnostic dumps were not added to the repository. Earlier
notes about these layouts being unverified describe the preceding implementation.
Additional layouts, OCR and editing remain future work. These are local results;
no Netlify deployment was performed.

## Spreadsheet export

Verified locally on 2026-10-12 with ExcelJS 4.4.0. The results area was replaced
by a spreadsheet preview. Each item is one row and repeats its invoice fields;
an invoice without parsed items still receives one row.

- XLSX is the default format; CSV can be selected.
- A browser test extracted the three supplied PDFs and confirmed five preview
  rows, then downloaded and reopened the XLSX workbook.
- The workbook contains one `Chi tiết hóa đơn` sheet with the same five rows,
  a frozen header, filters, numeric amount cells, and text formats for invoice
  numbers and tax IDs. Leading-zero values were preserved.
- The CSV download contains the same header and five rows with a UTF-8 BOM and
  RFC-style quoting for commas, quotes and line breaks.
- The empty-state download button is disabled, mobile layout has no page-level
  horizontal overflow, and no browser errors occurred.
- All 19 tests, strict type checking, linting, production build and isolated
  generated-function verification passed.

The earlier notes above saying export was disabled describe prior milestones.
No Netlify deployment was performed.
