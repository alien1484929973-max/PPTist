import type { Element } from 'pptxtojson'
import type { PptxSourceElementMetadata, SlideTransition } from '@pptist/presentation-core'
import type { PPTElement, TurningMode } from '@/types/slides'

export type SourceAwareElement = Element & {
  pptxSource?: PptxSourceElementMetadata
}

const sourceKindMatchesElement = (source: PptxSourceElementMetadata, element: Element) => {
  if (source.kind === 'sp' || source.kind === 'cxnSp') return element.type === 'shape' || element.type === 'text'
  if (source.kind === 'pic') return ['image', 'video', 'audio', 'math'].includes(element.type)
  if (source.kind === 'graphicFrame') return ['table', 'chart', 'diagram'].includes(element.type)
  if (source.kind === 'grpSp') return element.type === 'group'
  return true
}

export const assignPptxElementSources = (elements: Element[], sources: PptxSourceElementMetadata[]) => {
  const parsedElements = [...elements].sort((left, right) => left.order - right.order) as SourceAwareElement[]
  const unusedSources = new Set(sources)

  for (const element of parsedElements) {
    const parsedName = 'name' in element && typeof element.name === 'string' ? element.name : ''
    let source = parsedName
      ? [...unusedSources].find(candidate => candidate.name === parsedName && sourceKindMatchesElement(candidate, element))
      : undefined
    if (!source) source = [...unusedSources].find(candidate => sourceKindMatchesElement(candidate, element))
    if (!source) continue

    element.pptxSource = source
    unusedSources.delete(source)
    if (element.type === 'group' && source.children?.length) {
      assignPptxElementSources(element.elements as Element[], source.children)
    }
  }
}

export const applyImportedIdentity = (element: PPTElement, imported: SourceAwareElement) => {
  const source = imported.pptxSource
  const importedName = 'name' in imported && typeof imported.name === 'string' ? imported.name : undefined
  const name = source?.name || importedName
  if (name) element.name = name
  if (!source) return

  element.source = {
    provider: source.provider,
    slideIndex: source.slideIndex,
    shapeId: source.shapeId,
    name: source.name,
    creationId: source.creationId,
  }
  if (name?.startsWith('!!')) element.morphKey = name
}

export const transitionTurningMode = (transition?: SlideTransition): TurningMode | undefined => {
  if (!transition) return undefined
  if (transition.type === 'morph') return 'morph'
  if (transition.type === 'none' || transition.type === 'cut') return 'no'
  if (transition.type === 'fade' || transition.type === 'dissolve') return 'fade'
  if (['push', 'wipe', 'cover', 'uncover', 'pull'].includes(transition.type)) {
    return transition.direction === 'l' || transition.direction === 'r' ? 'slideX' : 'slideY'
  }
  return 'fade'
}
