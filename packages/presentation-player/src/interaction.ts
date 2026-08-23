import type { PlayerWidgetOverscrollBehavior } from './types'

export type PlayerWheelIntent = 'player' | 'scroll' | 'contain' | 'interactive'

const canScroll = (element: HTMLElement, delta: number, vertical: boolean) => {
  const position = vertical ? element.scrollTop : element.scrollLeft
  const viewport = vertical ? element.clientHeight : element.clientWidth
  const extent = vertical ? element.scrollHeight : element.scrollWidth
  if (extent <= viewport + 0.5) return false
  if (delta < 0) return position > 0.5
  return position + viewport < extent - 0.5
}

const hasNativeScroll = (element: HTMLElement, vertical: boolean) => {
  const view = element.ownerDocument.defaultView
  if (!view) return false
  const style = view.getComputedStyle(element)
  const overflow = vertical ? style.overflowY : style.overflowX
  return ['auto', 'scroll', 'overlay'].includes(overflow)
}

/** Decide whether a wheel event belongs to a nested widget or presentation navigation. */
export const resolvePlayerWheelIntent = (
  target: Element | null,
  boundary: Element,
  deltaX: number,
  deltaY: number,
): PlayerWheelIntent => {
  if (!target) return 'player'
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX)
  const delta = vertical ? deltaY : deltaX
  const scrollContainers: HTMLElement[] = []
  const protocolContainers: HTMLElement[] = []
  let current: Element | null = target

  while (current && current !== boundary) {
    const element = current as HTMLElement
    const protocolScroll = element.dataset?.pptistScroll === 'true'
    if (protocolScroll) protocolContainers.push(element)
    if (protocolScroll || hasNativeScroll(element, vertical)) scrollContainers.push(element)
    current = current.parentElement
  }

  for (const container of scrollContainers) {
    if (canScroll(container, delta, vertical)) return 'scroll'
  }
  const boundaryPolicy = protocolContainers.find(container =>
    (container.dataset.pptistOverscroll as PlayerWidgetOverscrollBehavior | undefined) !== 'handoff')
  if (boundaryPolicy) return 'contain'
  if (protocolContainers.length) return 'player'
  if (target.closest('[data-pptist-interactive],a,button,input,select,textarea,[contenteditable="true"],video,audio,.pptist-player-link,[data-pptist-no-advance]')) {
    return 'interactive'
  }
  return 'player'
}
