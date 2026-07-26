export * from './types'

import type { EChartsOption } from 'echarts'

import type {
  AnalyzePlayerResourcesOptions,
  PlayerAnimationTimeline,
  PlayerDocument,
  PlayerDocumentSource,
  PlayerLegacyAnimation,
  PlayerOptions,
  PlayerResourceKind,
  PlayerResourceReport,
  PlayerSlide,
  PlayerState,
  PresentationPlayer,
} from './types'

export type PlayerChartType = 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter'

export interface PlayerChartData {
  labels: string[]
  legends: string[]
  series: number[][]
}

export interface PlayerChartOptionPayload {
  type: PlayerChartType
  data: PlayerChartData
  themeColors: string[]
  textColor?: string
  lineColor?: string
  lineSmooth?: boolean
  stack?: boolean
}

export interface PlayerChartHandle {
  update(payload: PlayerChartOptionPayload): void
  resize(size?: { width: number; height: number }): void
  destroy(): void
}

export declare const getChartOption: (payload: PlayerChartOptionPayload) => EChartsOption | null
export declare const renderPresentationChart: (
  container: HTMLElement,
  payload: PlayerChartOptionPayload,
  size: { width: number; height: number },
) => PlayerChartHandle

export declare const PRESENTATION_IMAGE_CLIP_PATHS: Readonly<Record<string, string>>
export declare const CURRENT_PLAYER_SCHEMA_VERSION: 2
export declare const SUPPORTED_PLAYER_SCHEMA_VERSIONS: readonly [1, 2]
export declare const validatePlayerDocument: (input: unknown) => string[]
export declare const assertPlayerDocument: (input: unknown) => PlayerDocument
export declare const parsePlayerDocument: (input: unknown) => PlayerDocument
export declare const readPlayerDocument: (input: unknown) => Promise<PlayerDocument>

export declare const analyzePresentationResources: (
  presentation: PlayerDocument,
  options?: AnalyzePlayerResourcesOptions,
) => PlayerResourceReport

export declare const resolvePlayerResourceUrl: (
  url: string,
  kind: PlayerResourceKind,
  options: Pick<PlayerOptions, 'resourceBaseUrl' | 'resolveResourceUrl'>,
) => string | null

export type CompatibilityStatus = 'supported' | 'partial' | 'adapter' | 'unsupported'
export interface CompatibilityMatrixEntry {
  id: string
  feature: string
  status: CompatibilityStatus
  baseline: string
  notes: string
}
export interface CompatibilityIssue {
  featureId: string
  severity: 'warning' | 'blocking'
  slideId?: string
  elementId?: string
  message: string
}
export interface CompatibilityReport {
  compatible: boolean
  issues: CompatibilityIssue[]
}
export declare const PRESENTATION_PLAYER_COMPATIBILITY: readonly CompatibilityMatrixEntry[]
export declare const analyzePresentationCompatibility: (presentation: PlayerDocument) => CompatibilityReport

export declare const timelineFromLegacyAnimations: (
  animations?: readonly PlayerLegacyAnimation[],
) => PlayerAnimationTimeline

export declare const timelineForSlide: (slide: PlayerSlide) => PlayerAnimationTimeline

export declare class DomPresentationPlayer implements PresentationPlayer {
  constructor(host: HTMLElement, options?: PlayerOptions)
  get state(): PlayerState
  load(presentation: PlayerDocumentSource, startIndex?: number): void
  play(): Promise<PlayerState>
  next(): Promise<PlayerState>
  previous(): Promise<PlayerState>
  goTo(slideIndex: number): PlayerState
  goToStep(slideIndex: number, stepIndex: number): PlayerState
  resize(): void
  destroy(): void
}

export declare const createPresentationPlayer: (
  container: HTMLElement,
  presentation: PlayerDocumentSource,
  options?: PlayerOptions,
) => PresentationPlayer
