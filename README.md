# invoice-extractor

Foundation for a Vietnamese PDF invoice extraction website. Includes a responsive
Vietnamese homepage, multi-PDF selection/removal, empty results and clearly
disabled extraction/Excel actions. Files stay in browser memory; there is no upload
or extraction yet. No environment variables are needed.

## Local development

Use Node **24.x** (`nvm use`) and **pnpm 10.34.7**, pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev                         # http://127.0.0.1:3000
pnpm typecheck
pnpm lint
pnpm build
pnpm preview                     # production preview; stop dev first
curl http://127.0.0.1:3000/api/health
```

Health returns `{"ok":true,"service":"invoice-extractor"}`.

## Architecture

- React + strict TypeScript; TanStack Start with file routes in `src/routes`.
- Tailwind CSS v4 through `@tailwindcss/vite`; shadcn/ui Button and Card installed
  with the official CLI. `@/*` resolves to `src/*` in Vite and TypeScript.
- Nitro's supported `nitro/vite` integration uses the **netlify** preset for Node
  functions. Start server routes (including health) are served by Nitro.
- Shared invoice/item/result types: `src/types/invoice.ts`. Server-only extraction
  contract: `src/server/extraction-service.server.ts`. Keep credentials and future
  adapters server-only; never put secrets in `VITE_*` variables.

[Compatibility and pinned versions](docs/compatibility.md) records the official
docs and selected versions. Nitro is a pinned beta; its Vite integration remains
under active development.

## Netlify setup (prepared, not deployed)

Connect this repository manually when ready. Project root is the build base.
`netlify.toml` sets **build: `pnpm build`**, **publish: `dist`**, **Node: `24`**, and
**pnpm: `10.34.7`**. The committed lockfile supports reproducible installation.
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

## Remaining work

Choose how the PDF-bytes-to-JSON Python parser will run outside the Nitro Node
function, implement and validate that adapter, add review/editing, then generate
an Excel workbook. No `invoice_parser.py` was present in the initial workspace.
The interface deliberately has no fake implementation. See
[architecture and pending decisions](docs/architecture.md).

Local verification results are recorded in [docs/verification.md](docs/verification.md).
