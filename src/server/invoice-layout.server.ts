import '@tanstack/react-start/server-only'

/** Match labels regardless of accents, casing, punctuation or wrapped lines. */
export function labelText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export const columnLabels = [
  /^(?:stt|so thu tu|no)$/, /(?:ten )?(?:hang hoa|dich vu|san pham|description)/,
  /^(?:don vi(?: tinh)?|dvt|unit)$/, /^(?:so luong|sl|quantity)$/,
  /^(?:don gia|unit price)$/, /^(?:thanh tien|line total|amount)$/,
]

export function tableColumns(cells: string[]): number[] | null {
  const indices = columnLabels.map((pattern) => cells.findIndex((cell) => pattern.test(labelText(cell))))
  return indices.every((index) => index >= 0) ? indices : null
}

export interface PositionedText {
  text: string
  x: number
  y: number
  width: number
  height: number
}

/** Recover tables without relying on PDF drawing primitives or supplier names. */
export function positionedTable(text: PositionedText[]): string[][] | null {
  const tokens = text.filter((item) => item.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
  const starts = tokens.filter((item) => columnLabels[0]!.test(labelText(item.text)))
  for (const start of starts) {
    const header = tokens.filter((item) => Math.abs(item.y - start.y) <= 16)
    const anchors = columnLabels.map((pattern) => header.find((item) => pattern.test(labelText(item.text))))
    if (anchors.some((item) => !item)) continue
    const columns = anchors as PositionedText[]
    if (columns.some((column, i) => i > 0 && column.x <= columns[i - 1]!.x)) continue
    // The description can start left of its centered heading. Account for optional
    // columns (e.g. “Tính chất HHDV”) between the item number and description.
    const previous = header.filter((item) => item.x < columns[1]!.x && item.y === start.y)
      .sort((a, b) => b.x - a.x)[0] ?? start
    const boundaries = [previous.x + previous.width + 1]
    for (let i = 2; i < columns.length; i++) {
      const left = columns[i - 1]!, right = columns[i]!
      boundaries.push((left.x + left.width + right.x) / 2)
    }
    const bottom = Math.max(...columns.map((item) => item.y)) + 4
    const rows: { y: number; tokens: PositionedText[] }[] = []
    for (const token of tokens.filter((item) => item.y > bottom)) {
      let row = rows.at(-1)
      if (!row || token.y - row.y > 3) { row = { y: token.y, tokens: [] }; rows.push(row) }
      row.tokens.push(token)
    }
    const table = [['STT', 'Tên hàng hóa', 'Đơn vị', 'Số lượng', 'Đơn giá', 'Thành tiền']]
    for (const row of rows) {
      const rowText = labelText(row.tokens.map((item) => item.text).join(' '))
      if (/cong tien|tong (?:cong |tien |thanh)|thue suat|tien thue|so tien viet|nguoi mua|nguoi ban/.test(rowText)) break
      const cells = Array.from({ length: 6 }, () => '')
      for (const token of row.tokens.sort((a, b) => a.x - b.x)) {
        const center = token.x + token.width / 2
        const column = boundaries.findIndex((boundary) => center < boundary)
        const index = column === -1 ? 5 : column
        cells[index] = `${cells[index]} ${token.text}`.trim()
      }
      if (/^\d+$/.test(cells[0]!)) {
        // Printed column-number guides are not invoice items.
        if (cells[1] === '2' && cells[2] === '3' && cells[3] === '4' && cells[4] === '5') continue
        table.push(cells)
      } else if (!cells[0] && cells[1] && cells.slice(2).every((cell) => !cell) && table.length > 1) {
        const last = table.at(-1)!
        last[1] = `${last[1]} ${cells[1]}`
      }
    }
    if (table.length > 1) return table
  }
  return null
}
