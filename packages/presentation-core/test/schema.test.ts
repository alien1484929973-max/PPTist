import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import {
  embedPptistPresentationDocument,
  isExplicitPresentationLink,
  migratePresentationDocument,
  PPTIST_PPTX_EMBEDDED_DOCUMENT_CONTENT_TYPE,
  PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH,
  PPTIST_PPTX_EMBEDDED_DOCUMENT_RELATIONSHIP,
  stripImplicitRichTextLinks,
  writePptxEmbeddedDocumentContentType,
  writePptxEmbeddedDocumentRelationship,
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

  assert.equal(migrated.schemaVersion, 4)
  assert.equal(migrated.title, 'Legacy')
  assert.equal(migrated.width, 1200)
  assert.equal(migrated.lastSlideIndex, 1)
  assert.deepEqual(migrated.slides.map(slide => slide.id), ['one', 'two'])
})

test('schema migration gives widgets an explicit hidden scrollbar policy', () => {
  const migrated = migratePresentationDocument({
    schemaVersion: 3,
    slides: [{
      id: 'one',
      elements: [
        { id: 'fixed', type: 'widget' },
        { id: 'long', type: 'widget', widgetScroll: { mode: 'document', overscroll: 'handoff' } },
      ],
    }],
  }, defaults)

  assert.deepEqual(migrated.slides[0], {
    id: 'one',
    elements: [
      {
        id: 'fixed',
        type: 'widget',
        widgetScroll: { mode: 'fit', overscroll: 'contain', scrollbar: 'hidden' },
      },
      {
        id: 'long',
        type: 'widget',
        widgetScroll: { mode: 'document', overscroll: 'handoff', scrollbar: 'hidden' },
      },
    ],
  })
})

test('PPTX package metadata exposes one stable embedded presentation part', () => {
  const contentTypes = writePptxEmbeddedDocumentContentType(
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
  )
  const relationships = writePptxEmbeddedDocumentRelationship(
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="office" Target="ppt/presentation.xml"/></Relationships>',
  )

  assert.ok(contentTypes.includes(`PartName="/${PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH}"`))
  assert.ok(contentTypes.includes(`ContentType="${PPTIST_PPTX_EMBEDDED_DOCUMENT_CONTENT_TYPE}"`))
  assert.match(relationships, /Id="rId3"/)
  assert.ok(relationships.includes(`Type="${PPTIST_PPTX_EMBEDDED_DOCUMENT_RELATIONSHIP}"`))
  assert.ok(relationships.includes(`Target="${PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH}"`))
  assert.equal(writePptxEmbeddedDocumentContentType(contentTypes), contentTypes)
  assert.equal(writePptxEmbeddedDocumentRelationship(relationships), relationships)
})

test('PPTX package embedding writes the playback document and package declarations', async () => {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
  )
  await embedPptistPresentationDocument(zip, { schemaVersion: 4, slides: [{ id: 'one' }] })

  assert.equal(
    await zip.file(PPTIST_PPTX_EMBEDDED_DOCUMENT_PATH)?.async('string'),
    '{"schemaVersion":4,"slides":[{"id":"one"}]}',
  )
  assert.ok((await zip.file('[Content_Types].xml')?.async('string'))?.includes(PPTIST_PPTX_EMBEDDED_DOCUMENT_CONTENT_TYPE))
  assert.ok((await zip.file('_rels/.rels')?.async('string'))?.includes(PPTIST_PPTX_EMBEDDED_DOCUMENT_RELATIONSHIP))
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
