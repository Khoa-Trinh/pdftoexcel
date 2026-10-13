import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig(({ command }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // The Cloudflare preset builds the deployment. Node keeps Vite's hot-reload
  // development loop usable; `preview` runs the built app in workerd.
  plugins: [tanstackStart(), react(), tailwindcss(), nitro({ preset: command === 'serve' ? 'node' : 'cloudflare_module' })],
  environments: {
    ssr: { build: { rollupOptions: { input: './src/server.ts' } } },
  },
}))
