export const audienceViewUrl = () => {
  const url = new URL(window.location.href)
  url.searchParams.set('mode', 'audience')
  return url.toString()
}
