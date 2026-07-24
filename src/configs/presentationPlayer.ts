export type PresentationRenderer = 'vue' | 'player'

const QUERY_KEY = 'renderer'
const STORAGE_KEY = 'pptist:presentation-renderer'
const DEFAULT_RENDERER: PresentationRenderer = import.meta.env.VITE_PRESENTATION_RENDERER_DEFAULT === 'vue'
  ? 'vue'
  : 'player'

/**
 * The framework-independent player is the formal default. Query/local storage
 * preserve a reproducible switch to the classic Vue renderer during rollout.
 */
export const getPresentationRenderer = (): PresentationRenderer => {
  const query = new URLSearchParams(window.location.search).get(QUERY_KEY)
  if (query === 'player' || query === 'vue') return query
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'player' || saved === 'vue') return saved
  }
  catch {
    // Storage can be unavailable in privacy-restricted popup contexts.
  }
  return DEFAULT_RENDERER
}

export const useDependencyPresentationPlayer = () => getPresentationRenderer() === 'player'

export const setPresentationRenderer = (renderer: PresentationRenderer) => {
  const url = new URL(window.location.href)
  url.searchParams.set(QUERY_KEY, renderer)
  try {
    window.localStorage.setItem(STORAGE_KEY, renderer)
  }
  catch {
    // The query parameter remains a complete fallback when storage is blocked.
  }
  window.history.replaceState(window.history.state, '', url)
}

export const audienceViewUrl = () => {
  const url = new URL(window.location.href)
  url.searchParams.set('mode', 'audience')
  return url.toString()
}
