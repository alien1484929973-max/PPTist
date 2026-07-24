export * from './types'

import type {
  PlayerAnimationTimeline,
  PlayerDocument,
  PlayerLegacyAnimation,
  PlayerOptions,
  PlayerSlide,
  PlayerState,
  PresentationPlayer,
} from './types'

export declare const timelineFromLegacyAnimations: (
  animations?: readonly PlayerLegacyAnimation[],
) => PlayerAnimationTimeline

export declare const timelineForSlide: (slide: PlayerSlide) => PlayerAnimationTimeline

export declare class DomPresentationPlayer implements PresentationPlayer {
  constructor(host: HTMLElement, options?: PlayerOptions)
  get state(): PlayerState
  load(presentation: PlayerDocument, startIndex?: number): void
  play(): Promise<PlayerState>
  next(): Promise<PlayerState>
  previous(): Promise<PlayerState>
  goTo(slideIndex: number): PlayerState
  resize(): void
  destroy(): void
}

export declare const createPresentationPlayer: (
  container: HTMLElement,
  presentation: PlayerDocument,
  options?: PlayerOptions,
) => PresentationPlayer
