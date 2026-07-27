import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPresentationMorphCandidates,
  matchMorphElements,
  presentationMorphKeyForCopy,
  presentationMorphNeedsAnimation,
  type MorphableElement,
} from '../src/index'

const element = (
  id: string,
  left: number,
  name: string,
  props: Partial<MorphableElement> = {},
): MorphableElement => ({
  id,
  type: 'shape',
  left,
  top: 0,
  width: 100,
  height: 100,
  rotate: 0,
  name,
  ...props,
})

test('Morph gives explicit !! names priority over inferred geometry', () => {
  const result = matchMorphElements(
    [element('from-forced', 0, '!!hero'), element('from-near', 290, 'other')],
    [element('to-forced', 300, '!!hero'), element('to-near', 295, 'other')],
  )

  assert.deepEqual(result.matches.map(match => [match.from.id, match.to.id, match.confidence]), [
    ['from-forced', 'to-forced', 'forced'],
  ])
  assert.deepEqual(result.leaving.map(item => item.id), ['from-near'])
  assert.deepEqual(result.entering.map(item => item.id), ['to-near'])
})

test('Morph does not pair incompatible element types', () => {
  const from = element('shape', 0, 'item')
  const to = { ...element('image', 0, 'item'), type: 'image' }
  const result = matchMorphElements([from], [to])

  assert.equal(result.matches.length, 0)
  assert.deepEqual(result.leaving.map(item => item.id), ['shape'])
  assert.deepEqual(result.entering.map(item => item.id), ['image'])
})

test('Morph never pairs a forced-name object with an ordinary object', () => {
  const props = { contentFingerprint: 'same', appearanceFingerprint: 'same' }
  const result = matchMorphElements(
    [element('from', 0, '!!hero', props)],
    [element('to', 0, 'hero', props)],
  )

  assert.equal(result.matches.length, 0)
})

test('Morph does not infer identity from proximity and type alone', () => {
  const from = element('from', 100, 'Rectangle 1')
  const to = element('to', 102, 'Rectangle 2')
  const result = matchMorphElements([from], [to])

  assert.equal(result.matches.length, 0)
  assert.deepEqual(result.leaving.map(item => item.id), ['from'])
  assert.deepEqual(result.entering.map(item => item.id), ['to'])
})

test('Morph respects explicit editor links and target exclusions', () => {
  const fromA = element('from-a', 0, 'A')
  const fromB = element('from-b', 100, 'B')
  const toA = element('to-a', 0, 'A')
  const toB = element('to-b', 100, 'B')
  const result = matchMorphElements([fromA, fromB], [toA, toB], {
    links: [{ fromElementId: 'from-b', toElementId: 'to-a' }],
    excludedToElementIds: ['to-b'],
  })

  assert.deepEqual(result.matches.map(match => [match.from.id, match.to.id, match.confidence]), [
    ['from-b', 'to-a', 'explicit'],
  ])
  assert.deepEqual(result.leaving.map(item => item.id), ['from-a'])
  assert.deepEqual(result.entering.map(item => item.id), ['to-b'])
})

test('Morph treats the same editor element id as strong identity', () => {
  const result = matchMorphElements(
    [element('stable-id', 0, 'Before')],
    [element('stable-id', 500, 'After')],
  )

  assert.deepEqual(result.matches.map(match => ({
    ids: [match.from.id, match.to.id],
    confidence: match.confidence,
    reason: match.reason,
  })), [{
    ids: ['stable-id', 'stable-id'],
    confidence: 'strong',
    reason: 'elementId',
  }])
})

test('Morph retains editor lineage across regenerated local ids', () => {
  const result = matchMorphElements(
    [element('from', 0, 'Before', { morphKey: 'object-lineage' })],
    [element('to', 500, 'After', { morphKey: 'object-lineage' })],
  )

  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].reason, 'morphKey')
  assert.equal(result.matches[0].confidence, 'strong')
})

test('an editor Morph id can inherit an imported PowerPoint creationId', () => {
  const result = matchMorphElements(
    [element('from', 0, 'Imported', {
      source: { provider: 'pptx', slideIndex: 0, shapeId: '7', creationId: '{pptx-object}' },
    })],
    [element('to', 200, 'Editor copy', { morphKey: '{pptx-object}' })],
  )

  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].reason, 'morphKey')
})

test('Morph exclusion vetoes manual links and automatic identity', () => {
  const result = matchMorphElements(
    [element('same-id', 0, 'A')],
    [element('same-id', 100, 'A')],
    {
      links: [{ fromElementId: 'same-id', toElementId: 'same-id' }],
      excludedToElementIds: ['same-id'],
    },
  )

  assert.equal(result.matches.length, 0)
  assert.deepEqual(result.leaving.map(item => item.id), ['same-id'])
  assert.deepEqual(result.entering.map(item => item.id), ['same-id'])
})

test('Morph keeps weighted PPTX shape evidence as an automatic fallback', () => {
  const source = { provider: 'pptx' as const, slideIndex: 0, shapeId: '12' }
  const target = { provider: 'pptx' as const, slideIndex: 1, shapeId: '12' }
  const result = matchMorphElements(
    [element('from', 0, 'Rectangle 1', { source, appearanceFingerprint: 'same-look' })],
    [element('to', 1, 'Rectangle 2', { source: target, appearanceFingerprint: 'same-look' })],
  )

  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].reason, 'shapeId')
  assert.ok((result.matches[0].score || 0) >= 80)
})

test('Morph does not let fuzzy evidence override different editor identities', () => {
  const props = { contentFingerprint: 'same', appearanceFingerprint: 'same' }
  const result = matchMorphElements(
    [element('from', 0, 'Same', { ...props, morphKey: 'identity-a' })],
    [element('to', 0, 'Same', { ...props, morphKey: 'identity-b' })],
  )

  assert.equal(result.matches.length, 0)
})

test('Morph leaves tied repeated objects unmatched instead of guessing', () => {
  const props = { contentFingerprint: 'same', appearanceFingerprint: 'same' }
  const result = matchMorphElements(
    [element('from-a', 0, 'Same', props), element('from-b', 0, 'Same', props)],
    [element('to', 0, 'Same', props)],
  )

  assert.equal(result.matches.length, 0)
})

test('copy identity follows PowerPoint-style slide lineage rules', () => {
  const editorElement = element('source-id', 0, 'Object')
  const importedElement = element('imported-id', 0, 'Object', {
    source: { provider: 'pptx', slideIndex: 0, shapeId: '4', creationId: '{creation}' },
  })
  const linkedElement = element('linked-id', 0, 'Object', { morphKey: 'stable-lineage' })

  assert.equal(presentationMorphKeyForCopy(editorElement, 'new-id', true), 'source-id')
  assert.equal(presentationMorphKeyForCopy(editorElement, 'new-id', false), 'new-id')
  assert.equal(presentationMorphKeyForCopy(importedElement, 'new-id', true), undefined)
  assert.equal(presentationMorphKeyForCopy(linkedElement, 'new-id', true), 'stable-lineage')
})

test('Morph keeps visually unchanged matched objects off the animation compositor', () => {
  const candidate = (id: string, props: Record<string, unknown> = {}) => createPresentationMorphCandidates([{
    id,
    morphKey: 'same-object',
    type: 'shape',
    left: 10,
    top: 20,
    width: 100,
    height: 80,
    rotate: 0,
    viewBox: [100, 80],
    path: 'M0 0L100 0L100 80L0 80Z',
    fill: '#4472c4',
    ...props,
  }])[0]

  assert.equal(presentationMorphNeedsAnimation(candidate('from'), candidate('to')), false)
  assert.equal(presentationMorphNeedsAnimation(candidate('from'), candidate('to', { top: 21 })), true)
  assert.equal(presentationMorphNeedsAnimation(candidate('from'), candidate('to', { fill: '#ed7d31' })), true)
})
