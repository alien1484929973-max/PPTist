import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'

const installDom = () => {
  const window = new Window({ url: 'https://example.test/' })
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    ResizeObserver: window.ResizeObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
  })
  const domHost = window.document.createElement('div')
  Object.defineProperties(domHost, {
    clientWidth: { value: 1000 },
    clientHeight: { value: 562.5 },
  })
  window.document.body.appendChild(domHost)
  return { window, host: domHost as unknown as HTMLElement }
}

test('standalone DOM package renders all formal element families without Vue', async () => {
  const { window, host } = installDom()
  const { createPresentationPlayer } = await import('../src/index')
  const player = createPresentationPlayer(host, {
    schemaVersion: 2,
    width: 1000,
    height: 562.5,
    theme: { fontName: 'Arial', fontColor: '#222', themeColors: ['#4472c4'] },
    slides: [{
      id: 'one',
      animationTimeline: {
        version: 1,
        animations: [{
          id: 'paragraph-in',
          target: { elementId: 'text', paragraphIndex: 0 },
          timing: { duration: 1, delay: 0, trigger: 'click' },
          effect: { class: 'entrance', canonical: { kind: 'fade', phase: 'entrance' } },
        }],
      },
      elements: [
        { id: 'text', type: 'text', left: 10, top: 10, width: 240, height: 80, rotate: 0, content: '<p>Hello<script>bad()</script></p>' },
        { id: 'image', type: 'image', left: 10, top: 100, width: 100, height: 100, rotate: 0, src: 'https://example.test/a.png', clip: { shape: 'heptagon', range: [[0, 0], [100, 100]] } },
        { id: 'shape', type: 'shape', left: 130, top: 100, width: 100, height: 100, rotate: 0, viewBox: [100, 100], path: 'M0 0L100 0L100 100Z', fill: '#f00' },
        { id: 'line', type: 'line', left: 10, top: 220, width: 2, start: [0, 0], end: [200, 40], style: 'dashed', color: '#000', points: ['arrow', 'dot'] },
        { id: 'table', type: 'table', left: 250, top: 10, width: 240, height: 120, rotate: 0, data: [[{ id: 'a', text: 'Cell', colspan: 1, rowspan: 1 }]], colWidths: [1], cellMinHeight: 30, outline: { width: 1, color: '#000' } },
        { id: 'latex', type: 'latex', left: 250, top: 150, width: 120, height: 50, rotate: 0, viewBox: [120, 50], path: 'M0 25L120 25', color: '#000', strokeWidth: 2 },
        { id: 'chart', type: 'chart', left: 500, top: 10, width: 300, height: 220, rotate: 0, chartType: 'bar', data: { labels: ['A'], legends: ['S'], series: [[1]] }, themeColors: ['#4472c4'] },
        { id: 'video', type: 'video', left: 500, top: 250, width: 160, height: 90, rotate: 0, src: 'https://example.test/a.mp4', autoplay: false },
        { id: 'audio', type: 'audio', left: 680, top: 250, width: 40, height: 40, rotate: 0, src: 'https://example.test/a.mp3', autoplay: false, loop: false, color: '#444' },
      ],
    }],
  }, {
    sanitizeHtml: html => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
    resolveResourceUrl: url => url.startsWith('javascript:') ? null : url,
  })

  assert.equal(host.querySelectorAll('[data-pptist-element-id]').length, 9)
  assert.equal(host.querySelector('.pptist-player-text')?.textContent, 'Hello')
  assert.equal((host.querySelector('.pptist-player-text p') as HTMLElement).style.visibility, 'hidden')
  assert.match((host.querySelector('.pptist-player-image') as HTMLElement).style.clipPath, /polygon/)
  assert.equal(host.querySelector('.pptist-player-cell-text')?.textContent, 'Cell')
  assert.ok(host.querySelector('.pptist-player-chart svg'))
  assert.ok(host.querySelector('video'))
  assert.ok(host.querySelector('audio'))
  assert.equal(player.state.slideCount, 1)
  await player.next()
  assert.equal((host.querySelector('.pptist-player-text p') as HTMLElement).style.visibility, 'visible')
  player.destroy()
  assert.equal(host.querySelector('.pptist-player-viewport'), null)
  await window.happyDOM.abort()
})

test('standalone navigation completes slide transitions and Morph', async () => {
  const { window, host } = installDom()
  const { createPresentationPlayer } = await import('../src/index')
  const element = (id: string, left: number) => ({
    id, type: 'text', left, top: 10, width: 200, height: 60, rotate: 0,
    name: '!!title', content: '<p>Morph</p>',
  })
  const player = createPresentationPlayer(host, {
    width: 1000,
    height: 562.5,
    slides: [
      { id: 'one', elements: [element('one-title', 10)] },
      { id: 'two', transition: { type: 'morph', duration: 1, morph: { mode: 'byObject' } }, elements: [element('two-title', 300)] },
    ],
  })
  await player.next()
  assert.equal(player.state.slideIndex, 1)
  assert.equal(host.querySelectorAll('.pptist-player-slide').length, 1)
  await player.previous()
  assert.equal(player.state.slideIndex, 0)
  assert.equal(host.querySelectorAll('.pptist-player-slide').length, 1)
  player.destroy()
  await window.happyDOM.abort()
})

test('the public player accepts JSON text and resolves linked media from its document base', async () => {
  const { window, host } = installDom()
  const { createPresentationPlayer } = await import('../src/index')
  const player = createPresentationPlayer(host, JSON.stringify({
    schemaVersion: 2,
    width: 1000,
    height: 562.5,
    slides: [
      {
        id: 'one',
        elements: [{ id: 'image', type: 'image', left: 0, top: 0, width: 100, height: 100, src: './media/photo.png' }],
      },
      {
        id: 'two',
        transition: { type: 'fade', duration: 1 },
        elements: [{ id: 'title', type: 'text', left: 0, top: 0, width: 300, height: 60, content: '<p>Second</p>' }],
      },
    ],
  }), {
    resourceBaseUrl: 'https://cdn.example.test/decks/demo.json',
  })

  assert.equal((host.querySelector('img') as HTMLImageElement).src, 'https://cdn.example.test/decks/media/photo.png')
  assert.equal(player.state.slideCount, 2)
  await player.next()
  assert.equal(player.state.slideIndex, 1)
  assert.equal(host.querySelector('.pptist-player-text')?.textContent, 'Second')
  player.destroy()
  await window.happyDOM.abort()
})

test('numeric rich-text fragments are not activated as links', async () => {
  const { window, host } = installDom()
  const { createPresentationPlayer } = await import('../src/index')
  const player = createPresentationPlayer(host, {
    width: 1000,
    height: 562.5,
    slides: [{
      id: 'one',
      elements: [{
        id: 'text',
        type: 'text',
        left: 0,
        top: 0,
        width: 500,
        height: 100,
        content: '<p><a href="1.7">1.7</a> <a href="90.3">3</a> <a href="https://example.test/help" data-pptist-link-origin="manual">帮助</a></p>',
      }],
    }],
  })

  const content = host.querySelector('.pptist-player-text') as HTMLElement
  assert.equal(content.textContent, '1.7 3 帮助')
  assert.equal(content.querySelectorAll('a').length, 1)
  assert.equal(content.querySelector('a')?.getAttribute('href'), 'https://example.test/help')
  player.destroy()
  await window.happyDOM.abort()
})

test('custom renderers can embed host webpage elements and release their resources', async () => {
  const { window, host } = installDom()
  const { createPresentationPlayer } = await import('../src/index')
  let cleanedUp = false
  const player = createPresentationPlayer(host, {
    width: 1000,
    height: 562.5,
    slides: [{
      id: 'one',
      elements: [{
        id: 'business-widget',
        type: 'webWidget',
        left: 100,
        top: 80,
        width: 320,
        height: 180,
        customData: { widgetTitle: '测试项目按钮' },
      }],
    }],
  }, {
    renderers: {
      webWidget({ element, container, onCleanup }) {
        const button = container.ownerDocument.createElement('button')
        button.dataset.testWidget = 'ready'
        button.textContent = String(element.customData?.widgetTitle)
        onCleanup(() => { cleanedUp = true })
        return button
      },
    },
  })

  assert.equal(host.querySelector('[data-test-widget="ready"]')?.textContent, '测试项目按钮')
  player.destroy()
  assert.equal(cleanedUp, true)
  await window.happyDOM.abort()
})

test('document-scoped keyboard and wheel controls advance exactly once per gesture', async () => {
  const { window, host } = installDom()
  const { createPresentationPlayer } = await import('../src/index')
  const slides = ['one', 'two', 'three'].map((id, index) => ({
    id,
    elements: [{ id: `text-${id}`, type: 'text', left: 0, top: 0, width: 200, height: 60, content: `<p>${index + 1}</p>` }],
  }))
  const player = createPresentationPlayer(host, { width: 1000, height: 562.5, slides }, {
    keyboard: true,
    keyboardScope: 'document',
    wheel: { threshold: 30, idleResetMs: 80 },
  })

  window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(player.state.slideIndex, 1)

  const viewport = host.querySelector('.pptist-player-viewport') as HTMLElement
  viewport.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true }) as unknown as Event)
  viewport.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true }) as unknown as Event)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(player.state.slideIndex, 2)

  player.destroy()
  await window.happyDOM.abort()
})
