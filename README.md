# invoice-extractor

Vietnamese PDF invoice extraction with TanStack Start, React, strict TypeScript,
Tailwind CSS v4, and the shadcn/ui `b3loz0GWm` preset. The app is prepared for
Cloudflare Workers and Workers Static Assets. It has **not been deployed**.

## Local development

Node 24 is selected by `.nvmrc`. Use the installed Nub package manager locally;
the committed `pnpm-lock.yaml` is also suitable for pnpm in CI.

```sh
nub install --frozen-lockfile
nub run dev                 # http://127.0.0.1:3000, Vite hot reload
nub run typecheck
nub run lint
nub run test
nub run build
nub run cf:typegen          # regenerate Cloudflare runtime/binding types
nub run preview             # builds, then runs the real Workers runtime locally
```

`GET /api/health` returns `{"ok":true,"service":"invoice-extractor"}`. During
development Vite uses Nitro's local Node preset for fast reload; `preview` uses
Wrangler/workerd and the production `cloudflare_module` build. If port 3000 is
occupied, run `nub exec wrangler dev --config wrangler.jsonc --port 3001` after
`nub run build`.

## Cloudflare deployment

`wrangler.jsonc` points to Nitro's `.output/server/index.mjs` Worker and
`.output/public` static assets. The build output is generated; do not commit it.
There is one deployment adapter: Nitro's Cloudflare module preset. The
Cloudflare Vite plugin is intentionally absent.

```sh
nub run deploy:dry-run       # build and validate upload locally; no publication
nub exec wrangler login      # authenticate when ready to deploy
nub run deploy               # builds and publishes to Cloudflare Workers
```

For a pnpm-based CI environment, use `pnpm install --frozen-lockfile` and
`pnpm run deploy`. Publishing requires a Cloudflare account and may create a
`*.workers.dev` Worker. No cloud resources were created by this migration.

Cloudflare chooses the execution location based on its network. This does not
guarantee a Singapore server or Singapore data residency. The Workers Free plan
currently allows 100,000 Worker requests per day and 10 ms CPU time per request;
static asset requests are free. The PDF and XLSX work happens in the browser so
those operations do not consume Worker CPU. [Current limits](https://developers.cloudflare.com/workers/platform/limits/)
and [placement rules](https://developers.cloudflare.com/workers/configuration/placement/)
are maintained by Cloudflare.

## Data flow and limits

The PDF picker accepts multiple files and starts extraction immediately after selection.
Up to two dedicated browser Web Workers read files with PDF.js and reconstruct
fields and item rows using text coordinates. The remaining files wait in a queue,
so PDF memory use stays bounded; each file gets
its own result or error. Files are limited to 4 MiB and 100 pages. Scanned,
encrypted, damaged, or unsupported PDFs need manual review. OCR is not included.
The three supplied Rovin, 3K, and Xảo Minh invoices produce five item rows in
local browser checks.

After selecting PDFs, the page offers Add, Clear all, per-file progress, and
per-file removal. Files that are actively being read cannot be removed until
they finish; completed and queued files can be removed while other files run.
The full-width Xem Excel button opens a full-screen, scrollable table preview.
Drag the handle at the start of a row to reorder it; keyboard users can focus
the handle, press Space, use the arrow keys, and press Space again. The compact
toolbar has a format selector, download icon, and close icon. CSV is the default;
Excel (.xlsx) is also available. Downloads follow the visible row order and run
locally in the browser.
For mixed-rate invoices, each item row shows its own VAT rate and tax amount;
an unissued invoice number is still flagged for review.
Invoice numbers and tax IDs remain text. No PDF bytes or extracted fields are
posted to Cloudflare, analytics, or storage. Refreshing the page clears them.
The old Node parser and CLI remain as local references:

```sh
nub run parse:invoice /path/to/invoice.pdf
```

See [architecture](docs/architecture.md), [parser details](docs/parser.md),
and [verification](docs/verification.md). Editing the extracted cells, drag-and-drop,
and OCR are not implemented.
