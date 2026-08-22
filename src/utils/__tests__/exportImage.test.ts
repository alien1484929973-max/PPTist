import assert from 'node:assert/strict'
import test from 'node:test'
import { createExportImageResolver, ExportImageDownloadError } from '../exportImage'

const imageResponse = () => new Response(
  new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
  { status: 200, headers: { 'Content-Type': 'image/png' } },
)

test('keeps existing base64 image data without another request', async () => {
  let calls = 0
  const resolver = createExportImageResolver({
    fetcher: (() => {
      calls++
      return Promise.resolve(imageResponse())
    }) as typeof fetch,
  })
  const source = 'data:image/png;base64,iVBORw0KGgo='
  assert.equal(await resolver(source), source)
  assert.equal(calls, 0)
})

test('downloads an image once and caches the resulting data URL', async () => {
  let calls = 0
  const resolver = createExportImageResolver({
    fetcher: (() => {
      calls++
      return Promise.resolve(imageResponse())
    }) as typeof fetch,
  })
  const source = '/images/example.png'
  const [first, second] = await Promise.all([resolver(source), resolver(source)])
  assert.match(first, /^data:image\/png;base64,/)
  assert.equal(second, first)
  assert.equal(calls, 1)
})

test('uses the authenticated proxy when a remote image is blocked by CORS', async () => {
  const calls: string[] = []
  const resolver = createExportImageResolver({
    fetcher: (input => {
      const url = String(input)
      calls.push(url)
      if (calls.length === 1) return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(imageResponse())
    }) as typeof fetch,
  })
  const source = 'https://cdn.example.com/photo.png?size=large'
  const data = await resolver(source)
  assert.match(data, /^data:image\/png;base64,/)
  assert.equal(calls[0], source)
  assert.match(calls[1], /^\/api\/cloud\/export\/image\?source=/)
})

test('reports the original source when direct and proxy downloads both fail', async () => {
  const resolver = createExportImageResolver({
    fetcher: (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch,
  })
  const source = 'https://cdn.example.com/missing.png'
  await assert.rejects(resolver(source), error => {
    assert.ok(error instanceof ExportImageDownloadError)
    assert.equal(error.source, source)
    return true
  })
})
