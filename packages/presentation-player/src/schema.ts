import JSZip from 'jszip'
import { PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH as CORE_PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH } from '@pptist/presentation-core'
import type { PlayerDocument } from './types'

export const CURRENT_PLAYER_SCHEMA_VERSION = 4 as const
export const SUPPORTED_PLAYER_SCHEMA_VERSIONS = [1, 2, 3, 4] as const
export const PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH = CORE_PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH

/** Return actionable schema errors without mutating a document. */
export const validatePlayerDocument = (input: unknown): string[] => {
  if (!input || typeof input !== 'object') return ['Presentation must be an object.']
  const document = input as Partial<PlayerDocument>
  const errors: string[] = []
  if (!(Number(document.width) > 0)) errors.push('Presentation width must be a positive number.')
  if (!(Number(document.height) > 0)) errors.push('Presentation height must be a positive number.')
  if (!Array.isArray(document.slides)) errors.push('Presentation slides must be an array.')
  else {
    document.slides.forEach((slide, index) => {
      if (!slide || typeof slide !== 'object') errors.push(`Slide ${index} must be an object.`)
      else if (!Array.isArray(slide.elements)) errors.push(`Slide ${index} elements must be an array.`)
    })
  }
  if (
    document.schemaVersion !== undefined &&
    !SUPPORTED_PLAYER_SCHEMA_VERSIONS.includes(document.schemaVersion as 1 | 2 | 3 | 4)
  ) {
    errors.push(`Unsupported presentation schema version: ${document.schemaVersion}.`)
  }
  return errors
}

export const assertPlayerDocument = (input: unknown): PlayerDocument => {
  const errors = validatePlayerDocument(input)
  if (errors.length) throw new TypeError(errors.join(' '))
  return input as PlayerDocument
}

/** Parse JSON text or validate an already parsed presentation document. */
export const parsePlayerDocument = (input: unknown): PlayerDocument => {
  if (typeof input !== 'string') return assertPlayerDocument(input)
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  }
  catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new SyntaxError(`Invalid presentation JSON: ${detail}`)
  }
  return assertPlayerDocument(parsed)
}

const binaryDocumentSource = async (input: unknown) => {
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  if (
    input &&
    typeof input === 'object' &&
    'arrayBuffer' in input &&
    typeof (input as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  ) {
    return new Uint8Array(await (input as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer())
  }
  return undefined
}

const isZipPackage = (bytes: Uint8Array) => bytes.length >= 4 &&
  bytes[0] === 0x50 && bytes[1] === 0x4b &&
  ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))

const readBinaryPlayerDocument = async (bytes: Uint8Array) => {
  if (!isZipPackage(bytes)) return parsePlayerDocument(new TextDecoder().decode(bytes))
  const zip = await JSZip.loadAsync(bytes)
  const embedded = zip.file(PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH)
  if (!embedded) {
    throw new TypeError('PPTX does not contain an embedded PPTist presentation document.')
  }
  return parsePlayerDocument(await embedded.async('string'))
}

/** Read a PPTist PPTX, File, Blob, Response, JSON text, bytes, or an already parsed object. */
export const readPlayerDocument = async (input: unknown): Promise<PlayerDocument> => {
  const bytes = await binaryDocumentSource(input)
  if (bytes) return readBinaryPlayerDocument(bytes)
  return parsePlayerDocument(input)
}
