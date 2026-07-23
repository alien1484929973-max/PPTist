import assert from 'node:assert/strict'
import test from 'node:test'
import { migratePresentationDocument } from '../src/index'

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
