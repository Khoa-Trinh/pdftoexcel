import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { extractInvoice } from '../src/server/invoice-parser.server.ts'

const filename = process.argv[2]
if (!filename) {
  console.error('Usage: nub run parse:invoice /path/to/invoice.pdf')
  process.exitCode = 1
} else {
  try {
    const result = await extractInvoice(await readFile(filename), basename(filename))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
