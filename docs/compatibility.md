# Cloudflare compatibility record

Checked on 2026-10-13 against the current official
[TanStack hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting),
[Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/),
[Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Nitro](https://nitro.build/),
[Nitro's Cloudflare preset](https://nitro.build/deploy/providers/cloudflare),
and the [shadcn/ui TanStack guide](https://ui.shadcn.com/docs/installation/tanstack).

TanStack Start documents Nitro's Vite integration as an alternative deployment
path. Nitro documents the `cloudflare_module` Workers preset. Together they build
this repository into `.output/server/index.mjs` and `.output/public`; Wrangler
successfully runs that output in the local Workers runtime. The official
Cloudflare guide uses a different `@cloudflare/vite-plugin` adapter and explicitly
says not to combine it with Nitro. This project uses Nitro alone.

The old Node PDF API could not be bundled for Workers because `pdf-parse` loads a
native canvas `.node` binary. PDF parsing moved to a browser Web Worker. The
retained Node CLI is excluded from the Worker bundle; the dry-run upload contains
about 1 MiB of server modules. The PDF.js worker and ExcelJS are static browser
assets. Nitro's Cloudflare Vite development runner currently fails against the
Miniflare 5 API brought by Wrangler 4.149.0, so `dev` uses Nitro's Node preset
for hot reload and `preview` uses the actual generated Worker via Wrangler.

Pinned direct versions used in this migration: TanStack Start 1.168.61,
React 19.3.0, Vite 8.3.4, Nitro 3.0.260903-beta, Wrangler 4.149.0,
PDF.js 5.4.296, ExcelJS 4.4.0, Tailwind CSS 4.3.3, and TypeScript 5.9.3.
Node 24 and the committed `pnpm-lock.yaml` are unchanged. shadcn/ui preset
`b3loz0GWm` (Luma/Mauve/Orange/Inter) is unchanged.
