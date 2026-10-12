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

No Netlify deployment, cloud resource creation, Python execution, invoice
extraction or Excel export was performed. These results establish local behavior
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
