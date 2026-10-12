# invoice-extractor

Foundation for a Vietnamese PDF invoice extraction website. Includes a responsive
Vietnamese homepage, multi-PDF selection/removal, empty results and clearly
disabled extraction/Excel actions. A native TypeScript parser, server adapter,
single-file extraction API and CLI are implemented. The homepage is not yet wired
to that API, so files selected there remain in browser memory. No environment
variables or Python runtime are needed.

## Local development

Use your installed **Nub** (verified with **0.9.0**). Nub resolves Node **24.x**
from `.nvmrc` and installs dependencies directly from `pnpm-lock.yaml`; a separate
pnpm or nvm installation is not required. See [Nub's package manager docs](https://nubjs.com/docs/install).

```sh
nub install --frozen-lockfile
nub run dev                         # http://127.0.0.1:3000
nub run typecheck
nub run lint
nub run test                        # parser unit and generated-PDF tests
nub run build
nub run verify:production           # checks the emitted function in isolation
nub run preview                     # production preview; stop dev first
curl http://127.0.0.1:3000/api/health
```

If a non-interactive shell cannot find your existing Nub installation, expose it
for that shell with `export PATH="$HOME/.nub/bin:$PATH"`.

The `packageManager` pnpm pin and lockfile remain for Netlify and tool
compatibility. Local `nub install` uses Nub's native installer, not a separately
installed pnpm executable.

Health returns `{"ok":true,"service":"invoice-extractor"}`.

## Architecture

- React + strict TypeScript; TanStack Start with file routes in `src/routes`.
- Tailwind CSS v4 through `@tailwindcss/vite`; shadcn/ui Button and Card installed
  with the official CLI. `@/*` resolves to `src/*` in Vite and TypeScript.
- Nitro's supported `nitro/vite` integration uses the **netlify** preset for Node
  functions. Start server routes (including health) are served by Nitro.
- Shared invoice/item/result types: `src/types/invoice.ts`. Server-only extraction
  adapter: `src/server/extraction-service.server.ts`. Keep credentials and future
  adapters server-only; never put secrets in `VITE_*` variables.

[Compatibility and pinned versions](docs/compatibility.md) records the official
docs and selected versions. Nitro is a pinned beta; its Vite integration remains
under active development.

## Netlify setup (prepared, not deployed)

Connect this repository manually when ready. Project root is the build base.
`netlify.toml` sets **build: `pnpm build`**, **publish: `dist`**, **Node: `24`**, and
**pnpm: `10.34.7`**. Netlify provisions the package manager in its own build
environment; your machine only needs Nub. The committed lockfile supports
reproducible installation.
Do not add Netlify's TanStack Vite plugin alongside Nitro or change publish to
`dist/client`: those settings belong to a different adapter.

The verified build emits static JS/CSS/fonts in `dist/assets`, and a Node function
at `.netlify/functions-internal/server/server.mjs` with `main.mjs` and supporting
chunks. Nitro generates catch-all routing (`path: "/*"`, `preferStatic: true`) in
the function's config, plus `.netlify/functions-internal/nitro.json` metadata.
Netlify picks up its internal functions directory; no custom SPA redirect or
functions directory override is needed. Run the build on Netlify's Linux builder.
Do not commit generated deployment output.

No cloud resources have been created and no site has been deployed. Local build
and preview checks do not verify a real Netlify deployment.

## TypeScript invoice parser

```sh
nub run parse:invoice /path/to/invoice.pdf
# Or POST one multipart file to the local backend:
curl -F 'file=@/path/to/invoice.pdf' http://127.0.0.1:3000/api/extract
```

`extractInvoice(bytes, filename)` in `src/server/invoice-parser.server.ts` preserves
the supplied Python script's snake_case JSON contract, including `OK`/`REVIEW`,
issues and processing time. The `ExtractionService` adapter and API return the
app's camelCase types with `extracted`/`needs_review` statuses and item references.
Invoice numbers and tax IDs remain strings. `decimal.js` handles arithmetic before
conversion to JSON numbers. Scanned/unsupported layouts require review; no OCR or
fake data is provided. The API accepts one PDF up to 4 MiB / 100 pages and does not
store it. Malformed or password-protected PDFs return a safe error.

The PDF engine uses `pdf-parse` **2.4.5** and matching PDF.js **5.4.296**; decimal
arithmetic uses `decimal.js` **10.6.0**. The worker is packaged locally; no CDN is
used. All parser code and dependencies stay out of client bundles. See
[parser design and limitations](docs/parser.md).

## Remaining work

Connect the multi-file homepage to the extraction API, add review/editing, validate
with actual Rovin/3K/Xao Minh invoice PDFs, and generate an Excel workbook.
There is no Python service integration to configure. See
[architecture](docs/architecture.md) and [local verification](docs/verification.md).
