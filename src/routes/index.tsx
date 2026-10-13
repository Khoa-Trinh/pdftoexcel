import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { SpreadsheetPreview } from '@/components/spreadsheet-preview'
import type { ExtractionResult } from '@/types/invoice'

type FileOutcome = { result: ExtractionResult; error?: never } | { error: string; result?: never }

export const Route = createFileRoute('/')({ component: Home })

function fileKey(file: File) {
  return JSON.stringify([file.name, file.size, file.lastModified])
}

function Home() {
  const picker = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, FileOutcome>>({})
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const extracting = useRef(false)
  const pending = files.filter((file) => !outcomes[fileKey(file)]?.result)
  const results = files.flatMap((file) => {
    const result = outcomes[fileKey(file)]?.result
    return result ? [result] : []
  })

  function removeFile(file: File) {
    if (extracting.current) return
    const key = fileKey(file)
    setFiles((current) => current.filter((entry) => fileKey(entry) !== key))
    setOutcomes((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function extractFiles() {
    if (extracting.current || pending.length === 0) return
    extracting.current = true
    setNotice('')
    let worker: Worker | undefined
    try {
      worker = new Worker(new URL('../workers/extract.worker.ts', import.meta.url), { type: 'module' })
      // One file at a time bounds memory while keeping PDF work off the UI thread.
      for (const [index, file] of pending.entries()) {
        setProgress({ current: index + 1, total: pending.length })
        let outcome: FileOutcome
        try {
          if (file.size > 4 * 1024 * 1024) throw new Error('Tệp PDF quá lớn (tối đa 4 MB).')
          const bytes = await file.arrayBuffer()
          const result = await new Promise<ExtractionResult>((resolve, reject) => {
            worker!.onmessage = (event: MessageEvent<{ id: number; result?: ExtractionResult; error?: string }>) => {
              if (event.data.id !== index) return
              if (event.data.result) resolve(event.data.result)
              else reject(new Error(event.data.error ?? 'Không thể đọc PDF.'))
            }
            worker!.onerror = () => reject(new Error('Không thể khởi chạy bộ đọc PDF.'))
            worker!.postMessage({ id: index, filename: file.name, bytes }, [bytes])
          })
          outcome = { result }
        } catch (error) {
          outcome = { error: error instanceof Error ? error.message : 'Không thể đọc PDF. Vui lòng thử lại.' }
        }
        setOutcomes((current) => ({ ...current, [fileKey(file)]: outcome }))
      }
    } catch {
      setNotice('Không thể khởi chạy bộ đọc PDF.')
    } finally {
      worker?.terminate()
      extracting.current = false
      setProgress(null)
    }
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    if (extracting.current) return
    const selected = Array.from(event.target.files ?? [])
    const pdfs = selected.filter((file) => /\.pdf$/i.test(file.name))
    setFiles((current) => {
      const unique = new Map(current.map((file) => [fileKey(file), file]))
      for (const file of pdfs) unique.set(fileKey(file), file)
      return [...unique.values()]
    })
    setNotice(pdfs.length < selected.length ? 'Chỉ nhận tệp PDF. Các tệp khác đã được bỏ qua.' : '')
    // Allow selecting the same file again after removing it.
    event.target.value = ''
  }

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-3xl font-semibold sm:text-4xl">Trích xuất hóa đơn PDF</h1>

      <section aria-label="Chọn hóa đơn" className="space-y-4">
        <input
          ref={picker}
          id="invoice-files"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          disabled={progress !== null}
          className="sr-only"
          aria-label="Chọn các tệp hóa đơn PDF"
          onChange={selectFiles}
          tabIndex={-1}
        />
        <div className="flex flex-wrap gap-4">
          <Button type="button" variant="outline" size="lg" className="h-12 px-6 text-base" disabled={progress !== null} onClick={() => picker.current?.click()}>
            Chọn tệp PDF
          </Button>
          <Button type="button" disabled={progress !== null || pending.length === 0} size="lg" className="h-12 px-6 text-base" onClick={extractFiles}>
            {progress ? `Đang trích xuất ${progress.current}/${progress.total}…` : pending.length > 0 && pending.every((file) => outcomes[fileKey(file)]?.error) ? 'Thử lại tệp lỗi' : 'Trích xuất hóa đơn'}
          </Button>
        </div>

        <p role="status" aria-live="polite" className="text-base text-muted-foreground">
          {progress ? `Đang trích xuất ${progress.current}/${progress.total} tệp PDF` : files.length > 0 ? `Đã chọn ${files.length} tệp PDF` : 'Chưa có tệp nào được chọn.'}
        </p>
        {notice && <p role="alert" className="text-base text-destructive">{notice}</p>}
        {files.length > 0 && (
          <ul aria-label="Hóa đơn đã chọn" className="divide-y">
            {files.map((file) => (
              <li key={fileKey(file)} className="flex items-center gap-4 py-3 text-base">
                <div className="min-w-0 flex-1 break-all">
                  <span>{file.name}</span>
                  {outcomes[fileKey(file)]?.error && <p role="alert" className="text-base text-destructive">{outcomes[fileKey(file)]?.error}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="px-4 text-base"
                  aria-label={`Xóa ${file.name}`}
                  disabled={progress !== null}
                  onClick={() => removeFile(file)}
                >
                  Xóa
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SpreadsheetPreview results={results} />
    </main>
  )
}
