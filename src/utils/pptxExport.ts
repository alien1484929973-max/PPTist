import JSZip from 'jszip'
import {
  embedPptistPresentationDocument,
  editorTurningModeTransition,
  resolvePptxExportTimeline,
  writePptxTiming,
  writePptxTransition,
} from '@pptist/presentation-core'
import type { PresentationContent } from '@/types/cloud'
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
  const prefixes: string[] = []
  let nextAttributes = attributes
  if (/\bp14:/.test(xml)) {
    prefixes.push('p14')
    if (!/xmlns:p14=/.test(nextAttributes)) {
      nextAttributes += ' xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"'
    }
  }
  if (/\bp159:/.test(xml)) {
    prefixes.push('p159')
    if (!/xmlns:p159=/.test(nextAttributes)) {
      nextAttributes += ' xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main"'
    }
  }
  if (!prefixes.length) return match
  if (!/xmlns:mc=/.test(nextAttributes)) {
    nextAttributes += ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
  }
  const ignorable = /mc:Ignorable="([^"]*)"/.exec(nextAttributes)
  if (ignorable) {
    const values = new Set(ignorable[1].split(/\s+/).filter(Boolean))
    prefixes.forEach(prefix => values.add(prefix))
    nextAttributes = nextAttributes.replace(ignorable[0], `mc:Ignorable="${Array.from(values).join(' ')}"`)
  }
  else nextAttributes += ` mc:Ignorable="${prefixes.join(' ')}"`
  return `<p:sld${nextAttributes}>`
})

const injectSlideMetadata = (xml: string, slide: Slide) => {
  const ids = shapeIdMap(xml)
  const transition = writePptxTransition(slide.transition || editorTurningModeTransition(slide.turningMode))
  const timing = writePptxTiming(resolvePptxExportTimeline(slide), ids)
  if (!transition && !timing) return xml

  const withoutOldMetadata = xml
    .replace(/<p:transition\b[^>]*\/>|<p:transition\b[\s\S]*?<\/p:transition>/g, '')
    .replace(/<p:timing\b[^>]*\/>|<p:timing\b[\s\S]*?<\/p:timing>/g, '')
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
  presentation: PresentationContent,
) => {
  const zip = await JSZip.loadAsync(content)
  await Promise.all(presentation.slides.map(async (slide, index) => {
    const path = `ppt/slides/slide${index + 1}.xml`
    const file = zip.file(path)
    if (!file) return
    const xml = await file.async('string')
    zip.file(path, injectSlideMetadata(xml, slide))
  }))
  await embedPptistPresentationDocument(zip, presentation)
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
  })
}
