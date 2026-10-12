import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowDownToLine, FileText, Files, FolderOpen, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({ component: Home })

function fileKey(file: File) {
  return JSON.stringify([file.name, file.size, file.lastModified])
}

function Home() {
  const picker = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
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
    <div className="min-h-svh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-5 sm:px-8">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Files aria-hidden="true" className="size-6" /></span>
          <span className="text-lg font-semibold tracking-tight">Sổ hóa đơn</span>
          <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">Bản khởi tạo</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-9 max-w-2xl">
          <p className="mb-3 text-sm font-semibold tracking-widest text-primary uppercase">Từ hóa đơn đến bảng tính</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">Trích xuất hóa đơn PDF</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">Chọn hóa đơn, xem lại thông tin và tải về Excel.<br className="hidden sm:block" /> Mọi thứ trong một vài bước đơn giản.</p>
        </div>

        <ol aria-label="Các bước xử lý hóa đơn" className="mb-8 grid gap-3 sm:grid-cols-3">
          {['Chọn hóa đơn PDF', 'Xem lại & chỉnh sửa', 'Tải bảng Excel'].map((step, index) => (
            <li key={step} aria-current={index === 0 ? 'step' : undefined} className={`flex items-center gap-3 rounded-xl border px-4 py-4 ${index === 0 ? 'border-primary/30 bg-primary/5' : 'bg-card text-muted-foreground'}`}>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{index + 1}</span>
              <span className="font-medium">{step}</span>
            </li>
          ))}
        </ol>

        <Card className="border-border shadow-sm">
          <CardHeader className="px-6 pt-6 sm:px-8">
            <CardTitle className="text-xl">1. Chọn hóa đơn</CardTitle>
            <CardDescription className="text-base">Bạn có thể chọn nhiều tệp PDF cùng lúc.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6 pb-7 sm:px-8">
            <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.025] px-4 py-9 text-center">
              <FolderOpen aria-hidden="true" className="mb-4 size-10 text-primary" strokeWidth={1.5} />
              <p className="mb-5 text-base text-muted-foreground">Chọn hóa đơn PDF từ máy của bạn</p>
              <input ref={picker} id="invoice-files" type="file" accept=".pdf,application/pdf" multiple className="sr-only" aria-label="Chọn các tệp hóa đơn PDF" onChange={selectFiles} tabIndex={-1} />
              <Button type="button" size="lg" className="h-12 px-7 text-base" onClick={() => picker.current?.click()}><Files aria-hidden="true" />Chọn tệp PDF</Button>
              <p className="mt-4 text-sm text-muted-foreground">Có thể thêm tệp bằng cách bấm lại nút này.</p>
            </div>

            <p role="status" aria-live="polite" className="text-base font-medium">{files.length > 0 ? `Đã chọn ${files.length} tệp PDF` : 'Chưa có tệp nào được chọn.'}</p>
            {notice && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{notice}</p>}
            {files.length > 0 && (
              <ul aria-label="Hóa đơn đã chọn" className="divide-y rounded-xl border bg-card">
                {files.map((file) => (
                  <li key={fileKey(file)} className="flex items-center gap-3 px-4 py-3">
                    <FileText aria-hidden="true" className="size-6 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 break-all text-base">{file.name}</span>
                    <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-3 text-base" aria-label={`Xóa ${file.name}`} onClick={() => setFiles((current) => current.filter((entry) => fileKey(entry) !== fileKey(file)))}><Trash2 aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Xóa</span></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><p>Tệp hiện chỉ được chọn trên máy của bạn, chưa được gửi lên máy chủ.</p></div>
            <div className="border-t pt-5">
              <Button disabled size="lg" className="min-h-12 w-full whitespace-normal px-5 py-3 text-base sm:w-auto">Trích xuất hóa đơn — Sắp có</Button>
              <p className="mt-3 text-sm text-muted-foreground">Tính năng trích xuất đang được phát triển.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-7 shadow-sm">
          <CardHeader className="px-6 pt-6 sm:px-8">
            <CardTitle className="text-xl">2. Kết quả hóa đơn</CardTitle>
            <CardDescription className="text-base">Thông tin hóa đơn và danh sách hàng hóa sẽ hiển thị tại đây.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-7 sm:px-8">
            <div className="rounded-xl bg-muted/60 px-5 py-10 text-center">
              <FileText aria-hidden="true" className="mx-auto mb-4 size-9 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-lg font-medium">Chưa có kết quả</p>
              <p className="mt-2 text-base text-muted-foreground">Sau khi trích xuất, bạn sẽ có thể xem lại và chỉnh sửa dữ liệu.</p>
            </div>
            <Button disabled variant="outline" size="lg" className="mt-5 min-h-12 w-full whitespace-normal px-5 py-3 text-base sm:w-auto"><ArrowDownToLine aria-hidden="true" />Tải Excel — Sắp có</Button>
            <p className="mt-3 text-sm text-muted-foreground">Tính năng xuất Excel đang được phát triển.</p>
          </CardContent>
        </Card>
        <footer className="mt-8 text-center text-sm leading-relaxed text-muted-foreground">Dễ chọn. Dễ kiểm tra. Dễ lưu lại.</footer>
      </main>
    </div>
  )
}
