import { createFileRoute } from '@tanstack/react-router'
import { typescriptExtractionService } from '@/server/extraction-service.server'

const MAX_PDF_BYTES = 4 * 1024 * 1024

export const Route = createFileRoute('/api/extract')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Read a bounded body before multipart parsing (Content-Length is untrusted).
        const reader = request.body?.getReader()
        if (!reader) return Response.json({ error: 'Vui lòng gửi một tệp PDF.' }, { status: 400 })
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > MAX_PDF_BYTES + 64 * 1024) {
              await reader.cancel()
              return Response.json({ error: 'Tệp PDF quá lớn (tối đa 4 MB).' }, { status: 413 })
            }
            chunks.push(value)
          }
        } finally {
          reader.releaseLock()
        }
        try {
          const body = new Uint8Array(size)
          let offset = 0
          for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
          const form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
          const files = form.getAll('file')
          if (files.length !== 1 || !(files[0] instanceof File) || !files[0].size) {
            return Response.json({ error: 'Vui lòng gửi một tệp PDF trong trường file.' }, { status: 400 })
          }
          const file = files[0]
          if (file.size > MAX_PDF_BYTES) return Response.json({ error: 'Tệp PDF quá lớn (tối đa 4 MB).' }, { status: 413 })
          const bytes = new Uint8Array(await file.arrayBuffer())
          if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
            return Response.json({ error: 'Tệp không phải là PDF hợp lệ.' }, { status: 400 })
          }
          const result = await typescriptExtractionService.extract({ sourceFilename: file.name, pdfBytes: bytes }, { signal: request.signal })
          return Response.json(result, { headers: { 'cache-control': 'no-store' } })
        } catch {
          // Do not expose document contents, library internals, or server paths.
          return Response.json({ error: 'Không thể đọc PDF. Tệp có thể bị lỗi, được bảo vệ bằng mật khẩu hoặc vượt giới hạn 100 trang.' }, { status: 422 })
        }
      },
    },
  },
})
