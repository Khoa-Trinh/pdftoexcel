import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [tanstackStart(), react(), tailwindcss(), nitro({ preset: 'netlify' })],
  // Node-only PDF libraries contain native canvas bindings, not browser modules.
  optimizeDeps: { exclude: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'] },
  ssr: { external: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'] },
  environments: {
    ssr: { build: { rollupOptions: { input: './src/server.ts' } } },
  },
})
