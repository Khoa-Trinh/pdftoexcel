import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { FileText, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SpreadsheetPreview } from '@/components/spreadsheet-preview'
import type { ExtractionResult } from '@/types/invoice'

type FileOutcome = { result: ExtractionResult; error?: never } | { error: string; result?: never }
type FileProgress = { stage: 'queued' | 'reading'; completed: number; total: number }
type WorkerMessage = { id: number; result?: ExtractionResult; error?: string; progress?: { completed: number; total: number } }
const maxConcurrentFiles = 2

export const Route = createFileRoute('/')({ component: Home })

function fileKey(file: File) {
  return JSON.stringify([file.name, file.size, file.lastModified])
}

function Home() {
  const picker = useRef<HTMLInputElement>(null)
  const filesRef = useRef<File[]>([])
  const queueRef = useRef<File[]>([])
  const activeRef = useRef(new Map<string, Worker>())
  const mountedRef = useRef(true)
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, FileOutcome>>({})
  const [progress, setProgress] = useState<Record<string, FileProgress>>({})
  const results = files.flatMap((file) => {
    const result = outcomes[fileKey(file)]?.result
    return result ? [result] : []
  })

  const pump = useCallback(() => {
    if (!mountedRef.current) return
    while (activeRef.current.size < maxConcurrentFiles && queueRef.current.length > 0) {
      const file = queueRef.current.shift()!
      const key = fileKey(file)
      let worker: Worker
      try {
        if (file.size > 4 * 1024 * 1024) throw new Error('Tệp PDF quá lớn (tối đa 4 MB).')
        worker = new Worker(new URL('../workers/extract.worker.ts', import.meta.url), { type: 'module' })
      } catch (error) {
        setProgress((current) => { const next = { ...current }; delete next[key]; return next })
        setOutcomes((current) => ({ ...current, [key]: { error: error instanceof Error ? error.message : 'Không thể khởi chạy bộ đọc PDF.' } }))
        continue
      }

      activeRef.current.set(key, worker)
      setProgress((current) => ({ ...current, [key]: { stage: 'reading', completed: 0, total: 0 } }))
      const finish = (outcome: FileOutcome) => {
        if (activeRef.current.get(key) !== worker) return
        worker.terminate()
        activeRef.current.delete(key)
        setProgress((current) => { const next = { ...current }; delete next[key]; return next })
        setOutcomes((current) => ({ ...current, [key]: outcome }))
        pump()
      }
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.id !== 0 || activeRef.current.get(key) !== worker) return
        if (event.data.progress) {
          setProgress((current) => ({ ...current, [key]: { stage: 'reading', ...event.data.progress! } }))
        } else if (event.data.result) finish({ result: event.data.result })
        else finish({ error: event.data.error ?? 'Không thể đọc PDF.' })
      }
      worker.onerror = () => finish({ error: 'Không thể khởi chạy bộ đọc PDF.' })
      file.arrayBuffer().then((bytes) => {
        if (activeRef.current.get(key) === worker) worker.postMessage({ id: 0, filename: file.name, bytes }, [bytes])
      }).catch(() => finish({ error: 'Không thể mở tệp PDF.' }))
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const worker of activeRef.current.values()) worker.terminate()
      activeRef.current.clear()
      queueRef.current = []
    }
  }, [])

  function removeFile(file: File) {
    const key = fileKey(file)
    if (activeRef.current.has(key)) return
    queueRef.current = queueRef.current.filter((entry) => fileKey(entry) !== key)
    filesRef.current = filesRef.current.filter((entry) => fileKey(entry) !== key)
    setFiles(filesRef.current)
    setProgress((current) => { const next = { ...current }; delete next[key]; return next })
    setOutcomes((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function clearFiles() {
    if (activeRef.current.size > 0) return
    filesRef.current = []
    queueRef.current = []
    setFiles([])
    setProgress({})
    setOutcomes({})
    setNotice('')
  }

  function retryFile(file: File) {
    const key = fileKey(file)
    if (activeRef.current.has(key) || queueRef.current.some((entry) => fileKey(entry) === key)) return
    setOutcomes((current) => { const next = { ...current }; delete next[key]; return next })
    queueRef.current.push(file)
    setProgress((current) => ({ ...current, [key]: { stage: 'queued', completed: 0, total: 0 } }))
    pump()
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    const pdfs = selected.filter((file) => /\.pdf$/i.test(file.name))
    const known = new Set(filesRef.current.map(fileKey))
    const added: File[] = []
    for (const file of pdfs) {
      const key = fileKey(file)
      if (known.has(key)) continue
      known.add(key)
      added.push(file)
    }
    if (added.length > 0) {
      filesRef.current = [...filesRef.current, ...added]
      queueRef.current.push(...added)
      setFiles(filesRef.current)
      setProgress((current) => ({ ...current, ...Object.fromEntries(added.map((file) => [fileKey(file), { stage: 'queued', completed: 0, total: 0 }])) }))
      pump()
    }
    setNotice(pdfs.length < selected.length ? 'Chỉ nhận tệp PDF. Các tệp khác đã được bỏ qua.' : '')
    // Allow selecting the same file again after removing it.
    event.target.value = ''
  }

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-5 py-10 sm:px-8 sm:py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Trích xuất hóa đơn</h1>
        <p className="text-base text-muted-foreground">Chọn tệp hoặc nhiều tệp có văn bản để tạo bảng tính Excel.</p>
      </header>

      <section aria-label="Chọn hóa đơn" className="space-y-5">
        <input
          ref={picker}
          id="invoice-files"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          aria-label="Chọn các tệp hóa đơn PDF"
          onChange={selectFiles}
          tabIndex={-1}
        />
        {files.length === 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="lg" className="h-28 w-full border-dashed text-lg" onClick={() => picker.current?.click()}>
                Chọn tệp
              </Button>
            </TooltipTrigger>
            <TooltipContent>PDF có văn bản</TooltipContent>
          </Tooltip>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base text-muted-foreground">{files.length} tệp PDF</p>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="outline" size="lg" className="h-11 px-4 text-base" onClick={() => picker.current?.click()}>
                      <Plus aria-hidden="true" /> Thêm tệp
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Thêm PDF để đọc</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button type="button" variant="ghost" size="lg" className="h-11 px-4 text-base" disabled={activeRef.current.size > 0} onClick={clearFiles}>
                        Xóa tất cả
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{activeRef.current.size > 0 ? 'Đợi đọc xong' : 'Xóa mọi tệp'}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <ul aria-label="Hóa đơn đã chọn" className="divide-y rounded-xl border px-4 sm:px-5">
              {files.map((file) => {
                const outcome = outcomes[fileKey(file)]
                const status = progress[fileKey(file)]
                const active = activeRef.current.has(fileKey(file))
                return (
                  <li key={fileKey(file)} className="flex items-center gap-3 py-3.5 text-base">
                    <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-medium">{file.name}</p>
                      {status?.stage === 'queued' && <p className="text-sm text-muted-foreground">Đang chờ</p>}
                      {status?.stage === 'reading' && (
                        <div role="status" aria-live="polite" className="mt-1.5 space-y-1.5">
                          <p className="text-sm text-muted-foreground">{status.total > 0 ? `Đã đọc ${status.completed}/${status.total} trang` : 'Đang mở PDF…'}</p>
                          <Progress value={status.total > 0 ? Math.round(status.completed / status.total * 100) : 0} aria-label={`Tiến độ ${file.name}`} className="h-2" />
                        </div>
                      )}
                      {outcome?.error && <p role="alert" className="text-sm text-destructive">{outcome.error}</p>}
                      {outcome?.result && <p className="text-sm text-muted-foreground">{outcome.result.invoice.status === 'needs_review' ? 'Cần kiểm tra' : 'Đã trích xuất'} · {outcome.result.items.length} dòng hàng</p>}
                    </div>
                    {outcome?.error && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="ghost" size="icon-lg" aria-label={`Thử lại ${file.name}`} onClick={() => retryFile(file)}><RotateCcw aria-hidden="true" className="size-5" /></Button>
                        </TooltipTrigger>
                        <TooltipContent>Đọc lại tệp</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button type="button" variant="ghost" size="icon-lg" aria-label={`Xóa ${file.name}`} disabled={active} onClick={() => removeFile(file)}>
                            <Trash2 aria-hidden="true" className="size-5" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{active ? 'Đợi đọc xong' : 'Xóa tệp này'}</TooltipContent>
                    </Tooltip>
                  </li>
                )
              })}
            </ul>
            {results.length > 0 && <SpreadsheetPreview results={results} />}
          </div>
        )}
        {notice && <p role="alert" className="text-base text-destructive">{notice}</p>}
      </section>
    </main>
  )
}
