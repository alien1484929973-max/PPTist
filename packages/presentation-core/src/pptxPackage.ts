import type JSZip from 'jszip'

export const PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH = 'pptist/presentation.json' as const
export const PPTIST_PPTX_EMBEDDED_DOCUMENT_CONTENT_TYPE = 'application/vnd.pptist.presentation+json' as const
export const PPTIST_PPTX_EMBEDDED_DOCUMENT_RELATIONSHIP = 'https://pptist.dev/relationships/presentation' as const

export const writePptxEmbeddedDocumentContentType = (xml: string) => {
  const partName = `/${PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH}`
  if (xml.includes(`PartName="${partName}"`)) return xml
  const insertionIndex = xml.lastIndexOf('</Types>')
  if (insertionIndex < 0) return xml
  const override = `<Override PartName="${partName}" ContentType="${PPTIST_PPTX_EMBEDDED_DOCUMENT_CONTENT_TYPE}"/>`
  return `${xml.slice(0, insertionIndex)}${override}${xml.slice(insertionIndex)}`
}

export const writePptxEmbeddedDocumentRelationship = (xml: string) => {
  if (
    xml.includes(`Type="${PPTIST_PPTX_EMBEDDED_DOCUMENT_RELATIONSHIP}"`) ||
    xml.includes(`Target="${PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH}"`)
  ) return xml
  const insertionIndex = xml.lastIndexOf('</Relationships>')
  if (insertionIndex < 0) return xml
  const ids = Array.from(xml.matchAll(/\bId="rId(\d+)"/g), match => Number(match[1]))
  const relationshipId = `rId${Math.max(0, ...ids) + 1}`
  const relationship = `<Relationship Id="${relationshipId}" Type="${PPTIST_PPTX_EMBEDDED_DOCUMENT_RELATIONSHIP}" Target="${PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH}"/>`
  return `${xml.slice(0, insertionIndex)}${relationship}${xml.slice(insertionIndex)}`
}

export const embedPptistPresentationDocument = async (zip: JSZip, presentation: unknown) => {
  zip.file(PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH, JSON.stringify(presentation))
  const contentTypes = zip.file('[Content_Types].xml')
  if (contentTypes) {
    zip.file('[Content_Types].xml', writePptxEmbeddedDocumentContentType(await contentTypes.async('string')))
  }
  const relationships = zip.file('_rels/.rels')
  if (relationships) {
    zip.file('_rels/.rels', writePptxEmbeddedDocumentRelationship(await relationships.async('string')))
  }
}
