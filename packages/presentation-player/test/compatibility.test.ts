import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRESENTATION_PLAYER_COMPATIBILITY,
  PRESENTATION_IMAGE_CLIP_PATHS,
  analyzePresentationCompatibility,
  analyzePresentationResources,
  assertPlayerDocument,
  getChartOption,
  parsePlayerDocument,
  readPlayerDocument,
  type PlayerDocument,
} from '../src/index'

test('compatibility contract covers every formal migration category', () => {
  const ids = new Set(PRESENTATION_PLAYER_COMPATIBILITY.map(item => item.id))
  for (const required of [
    'text-rich-html', 'fonts', 'image-effects', 'shapes', 'lines', 'tables',
    'charts', 'latex', 'media', 'groups', 'links', 'scoped-animation',
    'motion-path', 'wipe-and-effects', 'slide-transitions', 'morph', 'sanitize-html',
  ]) assert.ok(ids.has(required), `missing compatibility row: ${required}`)
  assert.equal(PRESENTATION_PLAYER_COMPATIBILITY.some(item => item.status === 'unsupported'), false)
})

test('document audit blocks unknown elements but accepts built-in Morph', () => {
  const document: PlayerDocument = {
    width: 1000,
    height: 562.5,
    slides: [{
      id: 'slide-one',
      transition: { type: 'morph', duration: 700 },
      elements: [{ id: 'plugin', type: 'private-widget', left: 0, top: 0, width: 10, height: 10 }],
    }],
  }
  const report = analyzePresentationCompatibility(document)
  assert.equal(report.compatible, false)
  assert.deepEqual(report.issues.map(issue => issue.featureId), ['custom-element'])
})

test('unknown imported transitions use a non-blocking fade fallback', () => {
  const document: PlayerDocument = {
    width: 1000,
    height: 562.5,
    slides: [{ id: 'one', transition: { type: 'origami', duration: 500 }, elements: [] }],
  }
  const report = analyzePresentationCompatibility(document)
  assert.equal(report.compatible, true)
  assert.equal(report.issues[0].severity, 'warning')
})

test('built-in chart documents pass the element compatibility audit', () => {
  const document: PlayerDocument = {
    width: 1000,
    height: 562.5,
    slides: [{
      id: 'chart-slide',
      elements: [{ id: 'chart', type: 'chart', left: 0, top: 0, width: 500, height: 300 }],
    }],
  }
  assert.deepEqual(analyzePresentationCompatibility(document), { compatible: true, issues: [] })
})

test('all editor chart types have a real built-in ECharts option', () => {
  for (const type of ['bar', 'column', 'line', 'area', 'pie', 'ring', 'radar', 'scatter'] as const) {
    const option = getChartOption({
      type,
      data: { labels: ['A', 'B'], legends: ['One', 'Two'], series: [[1, 2], [3, 4]] },
      themeColors: ['#5b9bd5'],
    })
    assert.ok(option, `missing chart renderer for ${type}`)
    assert.ok(option.series, `missing series for ${type}`)
  }
})

test('the standalone player covers every editor image clip shape', () => {
  assert.deepEqual(Object.keys(PRESENTATION_IMAGE_CLIP_PATHS), [
    'rect', 'snip1Rect', 'snip2DiagRect', 'roundRect', 'ellipse', 'triangle',
    'rtTriangle', 'triangleReverse', 'diamond', 'pentagon', 'hexagon',
    'heptagon', 'octagon', 'chevron', 'homePlate', 'rightArrow',
    'parallelogram', 'parallelogramReverse', 'trapezoid', 'trapezoidReverse',
  ])
})

test('schema validation accepts legacy/current documents and rejects future versions', () => {
  const base = { width: 1000, height: 562.5, slides: [{ id: 'one', elements: [] }] }
  assert.equal(assertPlayerDocument({ ...base, schemaVersion: 1 }).schemaVersion, 1)
  assert.equal(assertPlayerDocument({ ...base, schemaVersion: 2 }).schemaVersion, 2)
  assert.throws(() => assertPlayerDocument({ ...base, schemaVersion: 99 }), /Unsupported presentation schema version/)
})

test('JSON text, File-like inputs, and parsed objects share one schema gate', async () => {
  const source = JSON.stringify({
    schemaVersion: 2,
    width: 1000,
    height: 562.5,
    slides: [{ id: 'one', elements: [] }],
  })
  assert.equal(parsePlayerDocument(source).slides[0].id, 'one')
  assert.equal((await readPlayerDocument(new Blob([source], { type: 'application/json' }))).schemaVersion, 2)
  assert.throws(() => parsePlayerDocument('{broken'), /Invalid presentation JSON/)
})

test('resource audit distinguishes portable links from session and host-relative URLs', () => {
  const document: PlayerDocument = {
    width: 1000,
    height: 562.5,
    slides: [{
      id: 'one',
      background: { type: 'image', image: { src: 'https://media.example.test/background.png' } },
      elements: [
        { id: 'image', type: 'image', left: 0, top: 0, width: 100, height: 100, src: '/images/photo.png' },
        { id: 'video', type: 'video', left: 0, top: 0, width: 100, height: 100, src: 'blob:session-video' },
      ],
    }],
  }
  const strict = analyzePresentationResources(document)
  assert.equal(strict.portable, false)
  assert.deepEqual(strict.issues.map(issue => issue.code), ['relative', 'session-url'])

  document.slides[0].elements[1].src = 'https://media.example.test/video.mp4'
  const based = analyzePresentationResources(document, { baseUrl: 'https://cdn.example.test/decks/demo.json' })
  assert.equal(based.portable, true)
  assert.equal(based.resources.find(resource => resource.elementId === 'image')?.resolvedUrl, 'https://cdn.example.test/images/photo.png')
})
