import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isExplicitPresentationLink,
  migratePresentationDocument,
  stripImplicitRichTextLinks,
} from '../src/index'

const defaults = {
  title: 'Untitled',
  width: 1000,
  height: 562.5,
  theme: { color: '#fff' },
  slides: [{ id: 'blank' }],
}

test('schema migration upgrades v1 documents and clamps their last slide index', () => {
  const migrated = migratePresentationDocument({
    schemaVersion: 1,
    title: 'Legacy',
    width: 1200,
    height: 675,
    theme: { color: '#000' },
    slides: [{ id: 'one' }, { id: 'two' }],
    lastSlideIndex: 20,
  }, defaults)

  assert.equal(migrated.schemaVersion, 2)
  assert.equal(migrated.title, 'Legacy')
  assert.equal(migrated.width, 1200)
  assert.equal(migrated.lastSlideIndex, 1)
  assert.deepEqual(migrated.slides.map(slide => slide.id), ['one', 'two'])
})

test('legacy implicit rich-text links are unwrapped without changing visible content', () => {
  const html = '<p><a href="1.7"><strong>1.7</strong></a> <a href="90.3">3</a> <a href="https://example.test/help">help</a></p>'

  assert.equal(
    stripImplicitRichTextLinks(html),
    '<p><strong>1.7</strong> 3 <a href="https://example.test/help">help</a></p>',
  )
  assert.equal(isExplicitPresentationLink('example.com'), false)
  assert.equal(isExplicitPresentationLink('javascript:alert(1)'), false)
  assert.equal(isExplicitPresentationLink('mailto:test@example.com'), true)
  assert.equal(isExplicitPresentationLink('../help'), true)
  assert.equal(isExplicitPresentationLink('#details'), true)
})
