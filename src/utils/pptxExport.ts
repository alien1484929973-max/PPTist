import JSZip from 'jszip'
import {
  editorTurningModeTransition,
  writePptxTiming,
  writePptxTransition,
} from '@pptist/presentation-core'
import type { Slide } from '@/types/slides'

export const pptistPptxObjectName = (elementId: string) => `pptist:${elementId}`

const shapeIdMap = (xml: string) => {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const result = new Map<string, string>()
  for (const node of Array.from(document.getElementsByTagName('*'))) {
    if (node.localName !== 'cNvPr') continue
    const name = node.getAttribute('name') || ''
    if (!name.startsWith('pptist:')) continue
    const elementId = name.slice('pptist:'.length)
    if (elementId.includes(':')) continue
    const shapeId = node.getAttribute('id')
    if (shapeId) result.set(elementId, shapeId)
  }
  return result
}

const ensureAnimationNamespaces = (xml: string) => xml.replace(/<p:sld\b([^>]*)>/, (match, attributes: string) => {
  let namespaces = ''
  if (!/xmlns:p14=/.test(attributes)) namespaces += ' xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"'
  if (!/xmlns:p159=/.test(attributes)) namespaces += ' xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main"'
  return namespaces ? `<p:sld${attributes}${namespaces}>` : match
})

const injectSlideMetadata = (xml: string, slide: Slide) => {
  const ids = shapeIdMap(xml)
  const transition = writePptxTransition(slide.transition || editorTurningModeTransition(slide.turningMode))
  const timing = writePptxTiming(slide.animationTimeline, ids)
  if (!transition && !timing) return xml

  const withoutOldMetadata = xml
    .replace(/<p:transition\b[\s\S]*?<\/p:transition>/g, '')
    .replace(/<p:timing\b[\s\S]*?<\/p:timing>/g, '')
  const metadata = transition + timing
  const rootExtensionIndex = withoutOldMetadata.lastIndexOf('<p:extLst')
  const slideEndIndex = withoutOldMetadata.lastIndexOf('</p:sld>')
  const insertionIndex = rootExtensionIndex > withoutOldMetadata.lastIndexOf('</p:cSld>')
    ? rootExtensionIndex
    : slideEndIndex
  if (insertionIndex < 0) return xml
  return ensureAnimationNamespaces(
    `${withoutOldMetadata.slice(0, insertionIndex)}${metadata}${withoutOldMetadata.slice(insertionIndex)}`,
  )
}

export const postProcessPptxExport = async (
  content: ArrayBuffer | Blob | Uint8Array,
  slides: readonly Slide[],
) => {
  const zip = await JSZip.loadAsync(content)
  await Promise.all(slides.map(async (slide, index) => {
    const path = `ppt/slides/slide${index + 1}.xml`
    const file = zip.file(path)
    if (!file) return
    const xml = await file.async('string')
    zip.file(path, injectSlideMetadata(xml, slide))
  }))
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
  })
}
