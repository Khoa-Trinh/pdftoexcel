import '@tanstack/react-start/server-only'
import type { ExtractionResult } from '@/types/invoice'

export interface ExtractionInput {
  sourceFilename: string
  pdfBytes: Uint8Array
}

/** Server-only contract. No adapter or fabricated extraction is provided. */
export interface ExtractionService {
  extract(input: ExtractionInput, options?: { signal?: AbortSignal }): Promise<ExtractionResult>
}
