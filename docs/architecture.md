# Current architecture

The app uses TanStack Start's file routes and SSR. Nitro's `nitro/vite` plugin
builds the `cloudflare_module` Worker, and Wrangler serves `.output/public` as
Workers Static Assets. `GET /api/health` is the only application API. There is
no Netlify adapter, Cloudflare Vite plugin, or PDF upload endpoint.

The PDF picker keeps `File` objects in browser memory. Selection starts extraction
immediately. Up to two module Web Workers in `src/workers/extract.worker.ts`
process files concurrently and return separate page progress and results. Extra
files wait in a queue. Transferred buffers avoid copying PDF bytes back to
the main thread. PDF.js runs inside that worker, with its own bundled PDF worker
asset loaded from Vite's build output. `src/lib/invoice-layout.ts` reconstructs
rows from text coordinates. `src/lib/invoice-fields.ts` applies regex aliases,
Vietnamese number rules, and decimal reconciliation. These modules are shared
with the retained local Node CLI, but are absent from the Cloudflare server
bundle.

React stores the selected files and results in memory. XLSX and CSV are generated
on demand in the browser. The existing XLSX output has one flattened item sheet:
invoice fields repeat on each item row. Invoice numbers and tax IDs remain text;
amounts remain numeric. The VAT-rate column uses each item's rate when present,
and line VAT and after-tax amounts sit beside the line total. The app sends no
invoice content to Cloudflare.

Development uses Nitro's Node preset for Vite hot reload. Production builds use
Nitro's Cloudflare module preset, and `nub run preview` starts Wrangler/workerd
against the generated Worker. The current Nitro Vite Cloudflare dev runner did
not work with the installed Miniflare 5 API; this split keeps both a usable dev
loop and a verified Cloudflare production preview.

The retained `src/server/invoice-parser.server.ts` and
`src/server/extraction-service.server.ts` support local CLI/tests only. They use
Node and `pdf-parse` and are not imported by server routes or bundled into the
Cloudflare Worker. No Python runtime is required; the supplied Python source
remains an external reference.
