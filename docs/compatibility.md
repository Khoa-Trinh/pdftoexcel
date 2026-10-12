# Compatibility record

Checked 2026-10-12 against current official documentation and package registry
metadata, before scaffolding. Verified on Node 24.21.0 (Linux x64), pnpm 10.34.7.

## Official documentation reviewed

- [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting):
  the current Vite setup supports `nitro/vite` as a deployment integration.
  The page fetch timed out; its official [repository source](https://github.com/TanStack/router/blob/main/docs/start/framework/react/guide/hosting.md)
  was read instead.
- [shadcn/ui TanStack installation](https://ui.shadcn.com/docs/installation/tanstack):
  initialize an existing Start project with the official CLI, then add components.
- [Tailwind CSS](https://tailwindcss.com/docs): v4 uses `@tailwindcss/vite` and the
  CSS `@import "tailwindcss"` entry.
- [Nitro TanStack example](https://nitro.build/examples/vite-ssr-tss-react):
  combine Start, React, Tailwind and Nitro Vite plugins with an SSR server entry.
  Here that entry is `src/server.ts` to avoid colliding with Nitro's root-level
  `server.ts` detection. It wraps Start's server handler with `createServerEntry`.
- [Nitro Netlify provider](https://nitro.build/deploy/providers/netlify): the
  `netlify` preset targets Node functions and publishes `dist`.
- [Netlify TanStack guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/):
  describes the alternative Netlify Vite plugin and `dist/client`. This project
  intentionally uses only Nitro's adapter and its actual output directory.

No concrete incompatibility was found in installation, type checking, build,
local production preview or direct calls to the generated Netlify function.
Nitro's latest published release is beta and its Vite integration is under active
development. Its dependency bundle emits non-fatal `MODULE_LEVEL_DIRECTIVE`
warnings for `"use client"` directives; the application does not enable React
Server Components. Browser verification checks SSR hydration and interactions.

Selected package engine ranges support Node 24; Start requires Node >=22.12 and
Vite requires ^20.19 or >=22.12. Tailwind's Vite plugin supports Vite 8; the React
plugin 6 targets Vite 8. TypeScript 5.9.3 is within typescript-eslint's supported
range (>=4.8.4 <6.1), unlike the latest TypeScript 7 release. The Router version
matches Start's exact Router dependency. All direct versions below are exact;
transitive versions and integrity hashes are locked in `pnpm-lock.yaml`.

## Versions

| Package | Exact version | Role |
| --- | --- | --- |
| `@fontsource-variable/geist` | `5.3.0` | Application/UI |
| `@tanstack/react-router` | `1.170.42` | Application/UI |
| `@tanstack/react-start` | `1.168.61` | Application/UI |
| `class-variance-authority` | `0.7.1` | Application/UI |
| `cn` | `0.4.0` | Application/UI |
| `decimal.js` | `10.6.0` | Server decimal arithmetic |
| `pdf-parse` | `2.4.5` | Server text/table PDF extraction |
| `pdfjs-dist` | `5.4.296` | Server reading order/image detection |
| `lucide-react` | `1.55.0` | Application/UI |
| `radix-ui` | `1.8.0` | Application/UI |
| `react` | `19.3.0` | Application/UI |
| `react-dom` | `19.3.0` | Application/UI |
| `shadcn` | `4.21.4` | Application/UI |
| `tw-animate-css` | `1.4.0` | Application/UI |
| `@eslint/js` | `10.0.1` | Build/checks |
| `@tailwindcss/vite` | `4.3.3` | Build/checks |
| `@types/node` | `24.19.2` | Build/checks |
| `@types/react` | `19.3.0` | Build/checks |
| `@types/react-dom` | `19.3.0` | Build/checks |
| `@vitejs/plugin-react` | `6.1.2` | Build/checks |
| `eslint` | `10.12.0` | Build/checks |
| `nitro` | `3.0.260903-beta` | Build/checks |
| `tailwindcss` | `4.3.3` | Build/checks |
| `typescript` | `5.9.3` | Build/checks |
| `typescript-eslint` | `8.71.1` | Build/checks |
| `vite` | `8.3.4` | Build/checks |

Package manager: **pnpm 10.34.7**. shadcn CLI: **4.21.4**.
The CLI was actually run:

```sh
pnpm dlx shadcn@4.21.4 init --preset nova --base radix --yes --no-monorepo --no-rtl
pnpm dlx shadcn@4.21.4 add button card --yes
```

Its generated `components.json`, UI source and CSS remain in the repository.

## Nub local workflow

Local setup now uses the OS-installed Nub **0.9.0**, with Node **24.21.0**
resolved from `.nvmrc`. `nub install --frozen-lockfile` reads the existing
pnpm lockfile through Nub's native installer; `nub run <script>` runs the
project scripts. This follows [Nub's documented lockfile compatibility](https://nubjs.com/docs/install).
The pnpm packageManager pin and Netlify settings remain for hosted builds;
no standalone local pnpm installation is required.

## PDF parser dependencies

The TypeScript port pins pdf-parse 2.4.5 and its matching pdfjs-dist 5.4.296 to
share the same PDF.js worker/version. Node 24 is supported by their package
engines. Decimal.js 10.6.0 replaces Python's Decimal for validation arithmetic.
See [pdf-parse's versioned official README](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/README.md)
and [parser architecture](parser.md). PDF parsing remains server-only, with a
packaged worker and traced Node dependencies in the Nitro function output.
