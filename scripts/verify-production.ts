import assert from 'node:assert/strict'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fixturePdf, invoiceFixture } from '../tests/pdf-fixture.ts'

// Run only the emitted function, copied away from the project's node_modules.
const directory = await mkdtemp(join(tmpdir(), 'invoice-function-'))
const originalDirectory = process.cwd()
try {
  await cp('.netlify/functions-internal/server', directory, { recursive: true })
  process.chdir(directory)
  const entry = pathToFileURL(join(directory, 'server.mjs')).href
  const { default: handler }: { default: (request: Request) => Promise<Response> } = await import(entry)
  const request = (body: FormData) => new Request('http://localhost/api/extract', { method: 'POST', body })
  const upload = (bytes: Uint8Array, name = 'invoice.pdf') => {
    const form = new FormData()
    form.set('file', new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }))
    return form
  }
  const response = await handler(request(upload(invoiceFixture())))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const result = await response.json()
  assert.equal(result.invoice.invoiceNumber, '0000123')
  assert.equal(result.invoice.supplierTaxId, '0012345678')
  assert.equal(result.invoice.status, 'extracted')
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].invoiceReference, result.invoice.id)

  const scan = await handler(request(upload(fixturePdf([{ image: true }]))))
  assert.equal(scan.status, 200)
  assert.equal((await scan.json()).invoice.status, 'needs_review')
  const invalid = await handler(request(upload(new TextEncoder().encode('not a PDF'))))
  assert.equal(invalid.status, 400)
  const broken = await handler(request(upload(new TextEncoder().encode('%PDF-1.7 broken'))))
  assert.equal(broken.status, 422)
  const empty = await handler(request(new FormData()))
  assert.equal(empty.status, 400)
  const multiple = upload(invoiceFixture())
  multiple.append('file', new File([new Uint8Array(invoiceFixture())], 'second.pdf'))
  assert.equal((await handler(request(multiple))).status, 400)
  assert.equal((await handler(request(upload(new Uint8Array(4 * 1024 * 1024 + 1))))).status, 413)
  const health = await handler(new Request('http://localhost/api/health'))
  assert.deepEqual(await health.json(), { ok: true, service: 'invoice-extractor' })
  console.log('PASS: isolated production Node function, Unicode PDF and table, scanned review, invalid/malformed/empty/multiple/oversized uploads, health JSON.')
} finally {
  process.chdir(originalDirectory)
  await rm(directory, { recursive: true, force: true })
}
