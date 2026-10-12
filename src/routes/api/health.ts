import { createFileRoute } from '@tanstack/react-router'

// TanStack server route, served by Nitro; handlers are removed from client builds.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true, service: 'invoice-extractor' }),
    },
  },
})
