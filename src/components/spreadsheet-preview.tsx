import { useMemo, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Download, GripVertical, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { downloadSpreadsheet, flattenExtractionResults, spreadsheetColumns } from '@/lib/spreadsheet'
import type { SheetFormat, SpreadsheetColumnKey, SpreadsheetValue } from '@/lib/spreadsheet'
import type { ExtractionResult } from '@/types/invoice'

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 })

function previewValue(value: SpreadsheetValue) {
  return typeof value === 'number' ? numberFormat.format(value) : value || '—'
}

function columnClass(key: SpreadsheetColumnKey) {
  if (key === 'sourceFilename') return 'w-72 min-w-72 whitespace-normal break-words'
  if (key === 'supplierName') return 'w-80 min-w-80 whitespace-normal break-words'
  if (key === 'description') return 'w-80 min-w-80 whitespace-normal break-words'
  if (key === 'issues') return 'w-80 min-w-80 whitespace-normal break-words'
  return 'whitespace-nowrap'
}

type PreviewRow = { id: string; value: Record<SpreadsheetColumnKey, SpreadsheetValue> }

function SortableRow({ entry, index }: { entry: PreviewRow; index: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const [tooltipOpen, setTooltipOpen] = useState(false)

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
      className={isDragging ? 'relative z-20 border-0 bg-background shadow-sm' : 'border-0'}
    >
      <TableCell className="w-12 min-w-12 border-r border-b px-1 text-center align-middle">
        <Tooltip open={tooltipOpen && !isDragging} onOpenChange={(nextOpen) => setTooltipOpen(nextOpen && !isDragging)}>
          <TooltipTrigger asChild>
            <Button
              ref={setActivatorNodeRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-grab touch-none active:cursor-grabbing"
              aria-label={`Sắp xếp dòng ${index + 1}`}
              onPointerDownCapture={() => setTooltipOpen(false)}
              onKeyDownCapture={(event) => { if (event.code === 'Space') setTooltipOpen(false) }}
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Kéo để đổi thứ tự</TooltipContent>
        </Tooltip>
      </TableCell>
      {spreadsheetColumns.map((column) => <TableCell key={column.key} className={`${columnClass(column.key)} border-r border-b px-4 py-3 align-top last:border-r-0`}>{previewValue(entry.value[column.key])}</TableCell>)}
    </TableRow>
  )
}

export function SpreadsheetPreview({ results }: { results: ExtractionResult[] }) {
  const [format, setFormat] = useState<SheetFormat>('csv')
  const [downloading, setDownloading] = useState(false)
  const [open, setOpen] = useState(false)
  const [rowOrder, setRowOrder] = useState<string[]>([])
  const rows = useMemo(() => flattenExtractionResults(results), [results])
  const sourceCount = new Set(rows.map((row) => row.sourceFilename)).size
  const sourceRows = useMemo(() => {
    const counts = new Map<string, number>()
    return rows.map((value) => {
      const filename = String(value.sourceFilename)
      const occurrence = counts.get(filename) ?? 0
      counts.set(filename, occurrence + 1)
      return { id: JSON.stringify([filename, occurrence]), value }
    })
  }, [rows])
  const orderedRows = useMemo(() => {
    const byId = new Map(sourceRows.map((entry) => [entry.id, entry]))
    const saved = rowOrder.flatMap((id) => {
      const entry = byId.get(id)
      return entry ? [entry] : []
    })
    const savedIds = new Set(saved.map((entry) => entry.id))
    return [...saved, ...sourceRows.filter((entry) => !savedIds.has(entry.id))]
  }, [sourceRows, rowOrder])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function moveRow({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = orderedRows.map((entry) => entry.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from !== -1 && to !== -1) setRowOrder(arrayMove(ids, from, to))
  }

  async function download() {
    if (orderedRows.length === 0 || downloading) return
    setDownloading(true)
    try {
      await downloadSpreadsheet(orderedRows.map((entry) => entry.value), format)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="lg" className="h-12 w-full text-base" disabled={rows.length === 0}>
          Xem Excel
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="inset-0 top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base font-semibold">Xem Excel</DialogTitle>
            <DialogDescription className="text-xs">{rows.length} dòng · {sourceCount} tệp PDF</DialogDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={format} onValueChange={(value) => setFormat(value as SheetFormat)}>
              <SelectTrigger aria-label="Định dạng tệp" className="h-9 min-w-30 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon-sm" aria-label={`Tải xuống ${format.toUpperCase()}`} disabled={downloading} onClick={download}>
                  {downloading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Download aria-hidden="true" className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tải tệp {format.toUpperCase()}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" onClick={() => setOpen(false)}><X aria-hidden="true" className="size-4" /></Button>
              </TooltipTrigger>
              <TooltipContent>Đóng bảng tính</TooltipContent>
            </Tooltip>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
          <div role="region" aria-label="Dữ liệu bảng tính" tabIndex={0} className="h-full overflow-hidden rounded-lg border [&_[data-slot=table-container]]:h-full [&_[data-slot=table-container]]:overflow-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={moveRow}>
              <SortableContext items={orderedRows.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
                <Table className="w-max min-w-full border-separate border-spacing-0 text-base">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow className="border-0 hover:bg-background">
                      <TableHead className="w-12 min-w-12 border-r border-b px-1 text-center"><span className="sr-only">Sắp xếp dòng</span></TableHead>
                      {spreadsheetColumns.map((column) => <TableHead key={column.key} className={`${columnClass(column.key)} border-r border-b px-4 py-3 last:border-r-0`}>{column.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedRows.map((entry, index) => <SortableRow key={entry.id} entry={entry} index={index} />)}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
