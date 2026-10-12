/** Small valid PDFs built in memory; no customer documents or PDF writer dependency. */
export interface FixturePage {
  lines?: { text: string; x: number; y: number }[]
  table?: { rows: string[][]; x?: number; top?: number }
  image?: boolean
}

export function fixturePdf(pages: FixturePage[]): Uint8Array {
  const characters = [...new Set(pages.flatMap((page) => [
    ...(page.lines ?? []).map((line) => line.text), ...(page.table?.rows.flat() ?? []),
  ]).join(''))]
  if (characters.length > 255) throw new Error('Fixture font character limit')
  const codes = new Map(characters.map((character, index) => [character, index + 1]))
  const encode = (text: string) => [...text].map((char) => codes.get(char)!.toString(16).padStart(4, '0')).join('')
  const textOp = (text: string, x: number, y: number) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm <${encode(text)}> Tj ET\n`
  const objects: Buffer[] = []
  const add = (value: string | Buffer) => { objects.push(typeof value === 'string' ? Buffer.from(value) : value); return objects.length }
  const stream = (value: Buffer, extra = '') => Buffer.concat([Buffer.from(`<< /Length ${value.length} ${extra} >>\nstream\n`), value, Buffer.from('\nendstream')])
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // Pages, filled after page objects are assigned.
  add('<< /Type /Font /Subtype /Type0 /BaseFont /Fixture /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 4 0 R >>')
  const mappings = characters.map((char, index) => `<${(index + 1).toString(16).padStart(4, '0')}> <${char.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')
  add(stream(Buffer.from(`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Fixture def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
${characters.length} beginbfchar
${mappings}
endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`)))
  add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Fixture /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /CIDToGIDMap /Identity /DW 500 /FontDescriptor 6 0 R >>')
  add('<< /Type /FontDescriptor /FontName /Fixture /Flags 4 /FontBBox [0 -200 1000 900] /Ascent 800 /Descent -200 /CapHeight 700 /ItalicAngle 0 /StemV 80 >>')
  const image = add(stream(Buffer.from([0, 0, 0]), '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8'))
  const pageIds: number[] = []
  for (const page of pages) {
    let ops = (page.lines ?? []).map((line) => textOp(line.text, line.x, line.y)).join('')
    if (page.table) {
      const x = page.table.x ?? 30, top = page.table.top ?? 700
      const widths = [45, 250, 80, 95, 120, 130]
      const edges = [x]
      for (const width of widths) edges.push(edges.at(-1)! + width)
      const height = 34
      for (let row = 0; row <= page.table.rows.length; row++) {
        const y = top - row * height
        ops += `${x} ${y} m ${edges.at(-1)} ${y} l S\n`
      }
      for (const edge of edges) ops += `${edge} ${top} m ${edge} ${top - page.table.rows.length * height} l S\n`
      page.table.rows.forEach((row, i) => row.forEach((cell, j) => { ops += textOp(cell, edges[j]! + 5, top - i * height - 21) }))
    }
    if (page.image) ops += 'q 100 0 0 100 50 50 cm /Im1 Do Q\n'
    const content = add(stream(Buffer.from(ops)))
    pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 850 1000] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${image} 0 R >> >> /Contents ${content} 0 R >>`))
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`)
  const chunks: Buffer[] = [Buffer.from('%PDF-1.7\n')]
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n'))
  }
  const startXref = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`))
  return new Uint8Array(Buffer.concat(chunks))
}

export const headers = ['STT', 'Tên hàng hóa', 'Đơn vị', 'Số lượng', 'Đơn giá', 'Thành tiền']
export const invoiceText = [
  'CÔNG TY THỬ NGHIỆM', 'Mã số thuế: 0012345678', 'Ngày 09 tháng 10 năm 2026',
  'Ký hiệu: C26TAA', 'Số: 0000123', 'Cộng tiền hàng: 2.500,25',
  'Thuế suất GTGT: 10%', 'Tiền thuế GTGT: 250,025', 'Tổng cộng tiền thanh toán: 2.750,275',
].join('\n')

export function invoiceFixture(): Uint8Array {
  return fixturePdf([{
    lines: invoiceText.split('\n').map((text, index) => ({ text, x: 30, y: 950 - 24 * index })),
    table: { rows: [headers, ['1', 'Hàng hóa thử nghiệm', 'Cái', '2,5', '1.000,1', '2.500,25']] },
  }])
}
