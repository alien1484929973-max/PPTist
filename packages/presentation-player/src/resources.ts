import type {
  AnalyzePlayerResourcesOptions,
  PlayerDocument,
  PlayerOptions,
  PlayerResourceClassification,
  PlayerResourceIssue,
  PlayerResourceKind,
  PlayerResourceReference,
  PlayerResourceReport,
} from './types'

interface PendingResource {
  kind: PlayerResourceKind
  value: unknown
  required: boolean
  slideIndex: number
  slideId: string
  elementId?: string
  path: string
}

const classifyResource = (
  url: string,
  baseUrl?: string,
): { classification: PlayerResourceClassification; resolvedUrl?: string } => {
  if (!url) return { classification: 'missing' }
  if (/^data:/i.test(url)) return { classification: 'embedded', resolvedUrl: url }
  if (/^blob:/i.test(url)) return { classification: 'session', resolvedUrl: url }

  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(url)
  if (hasProtocol) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { classification: 'remote', resolvedUrl: parsed.href }
      }
      return { classification: 'unsupported', resolvedUrl: parsed.href }
    }
    catch {
      return { classification: 'unsupported' }
    }
  }

  let resolvedUrl: string | undefined
  if (baseUrl) {
    try {
      resolvedUrl = new URL(url, baseUrl).href
    }
    catch {
      // The relative classification below provides the actionable diagnostic.
    }
  }
  return { classification: 'relative', resolvedUrl }
}

const resourceIssue = (
  resource: PlayerResourceReference,
  options: AnalyzePlayerResourcesOptions,
): PlayerResourceIssue | undefined => {
  if (resource.classification === 'missing') {
    return {
      code: 'missing',
      severity: 'blocking',
      message: `Required ${resource.kind} resource is missing at ${resource.path}.`,
      resource,
    }
  }
  if (resource.classification === 'unsupported') {
    return {
      code: 'unsupported-protocol',
      severity: 'blocking',
      message: `Resource protocol is not supported at ${resource.path}.`,
      resource,
    }
  }
  if (resource.classification === 'session' && options.allowBlobUrls !== true) {
    return {
      code: 'session-url',
      severity: 'blocking',
      message: `blob: URL at ${resource.path} only works in the page session that created it.`,
      resource,
    }
  }
  if (resource.classification === 'embedded' && options.allowDataUrls === false) {
    return {
      code: 'embedded-data',
      severity: 'blocking',
      message: `data: URL at ${resource.path} is embedded instead of link-based.`,
      resource,
    }
  }
  const relativeAllowed = options.allowRelativeUrls ?? !!options.baseUrl
  if (resource.classification === 'relative' && !relativeAllowed) {
    return {
      code: 'relative',
      severity: 'blocking',
      message: `Relative URL at ${resource.path} needs resourceBaseUrl in another host.`,
      resource,
    }
  }
  return undefined
}

/** Enumerate and audit every explicit resource field consumed by the player. */
export const analyzePresentationResources = (
  presentation: PlayerDocument,
  options: AnalyzePlayerResourcesOptions = {},
): PlayerResourceReport => {
  const pending: PendingResource[] = []
  presentation.slides.forEach((slide, slideIndex) => {
    const base = { slideIndex, slideId: slide.id }
    if (slide.background?.type === 'image') {
      pending.push({
        ...base,
        kind: 'background',
        value: slide.background.image?.src,
        required: true,
        path: `slides[${slideIndex}].background.image.src`,
      })
    }
    slide.elements.forEach((element, elementIndex) => {
      const elementBase = { ...base, elementId: element.id }
      if (element.type === 'image') {
        pending.push({ ...elementBase, kind: 'image', value: element.src, required: true, path: `slides[${slideIndex}].elements[${elementIndex}].src` })
      }
      else if (element.type === 'video' || element.type === 'audio') {
        pending.push({ ...elementBase, kind: 'media', value: element.src, required: true, path: `slides[${slideIndex}].elements[${elementIndex}].src` })
      }
      if (element.type === 'video' && element.poster) {
        pending.push({ ...elementBase, kind: 'poster', value: element.poster, required: false, path: `slides[${slideIndex}].elements[${elementIndex}].poster` })
      }
      if (element.type === 'shape' && element.pattern) {
        pending.push({ ...elementBase, kind: 'pattern', value: element.pattern, required: false, path: `slides[${slideIndex}].elements[${elementIndex}].pattern` })
      }
      if (element.link?.type === 'web' && element.link.target) {
        pending.push({ ...elementBase, kind: 'link', value: element.link.target, required: false, path: `slides[${slideIndex}].elements[${elementIndex}].link.target` })
      }
    })
  })

  const resources = pending.flatMap<PlayerResourceReference>(item => {
    const url = typeof item.value === 'string' ? item.value.trim() : ''
    if (!url && !item.required) return []
    const classified = classifyResource(url, options.baseUrl)
    return [{
      kind: item.kind,
      url,
      ...classified,
      slideIndex: item.slideIndex,
      slideId: item.slideId,
      elementId: item.elementId,
      path: item.path,
    }]
  })
  const issues = resources.flatMap(resource => {
    const issue = resourceIssue(resource, options)
    return issue ? [issue] : []
  })
  return {
    portable: !issues.some(issue => issue.severity === 'blocking'),
    resources,
    issues,
  }
}

/** Apply resourceBaseUrl and the host's allow/rewrite callback consistently. */
export const resolvePlayerResourceUrl = (
  url: string,
  kind: PlayerResourceKind,
  options: Pick<PlayerOptions, 'resourceBaseUrl' | 'resolveResourceUrl'>,
): string | null => {
  if (!url) return null
  let resolved = url
  if (options.resourceBaseUrl) {
    try {
      resolved = new URL(url, options.resourceBaseUrl).href
    }
    catch {
      return null
    }
  }
  return options.resolveResourceUrl ? options.resolveResourceUrl(resolved, kind) : resolved
}
