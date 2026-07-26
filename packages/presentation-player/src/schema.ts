import type { PlayerDocument } from './types'

export const CURRENT_PLAYER_SCHEMA_VERSION = 2 as const
export const SUPPORTED_PLAYER_SCHEMA_VERSIONS = [1, 2] as const

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
    !SUPPORTED_PLAYER_SCHEMA_VERSIONS.includes(document.schemaVersion as 1 | 2)
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

/** Read File, Blob, Response, JSON text, or an already parsed object. */
export const readPlayerDocument = async (input: unknown): Promise<PlayerDocument> => {
  if (
    input &&
    typeof input === 'object' &&
    'text' in input &&
    typeof (input as { text?: unknown }).text === 'function'
  ) {
    return parsePlayerDocument(await (input as { text: () => Promise<string> }).text())
  }
  return parsePlayerDocument(input)
}
