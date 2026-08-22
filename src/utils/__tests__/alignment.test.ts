import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAlignmentGuide,
  findClosestAlignment,
  getAlignmentGuidePadding,
  getAlignmentThreshold,
} from '../alignment'

test('selects the closest alignment line instead of the first match', () => {
  const match = findClosestAlignment([
    { value: 100, range: [0, 20] },
    { value: 103, range: [30, 50] },
  ], [{ value: 104, range: [60, 80] }], 6)

  assert.ok(match)
  assert.equal(match.line.value, 103)
  assert.equal(match.offset, 1)
})

test('uses anchor priority only when distances are equal', () => {
  const match = findClosestAlignment([
    { value: 100, range: [0, 20] },
  ], [
    { value: 99, range: [30, 50], priority: 1 },
    { value: 101, range: [30, 50], priority: 0 },
  ], 6)

  assert.ok(match)
  assert.equal(match.anchor.value, 101)
})

test('keeps alignment sensitivity and guide padding stable on screen', () => {
  assert.equal(getAlignmentThreshold(0.5), 12)
  assert.equal(getAlignmentThreshold(2), 3)
  assert.equal(getAlignmentGuidePadding(0.5), 24)
  assert.equal(getAlignmentGuidePadding(2), 6)
})

test('creates a padded guide spanning the source and target ranges', () => {
  const match = findClosestAlignment([
    { value: 100, range: [20, 40] },
  ], [{ value: 102, range: [60, 90] }], 6)

  assert.ok(match)
  assert.deepEqual(createAlignmentGuide('horizontal', match, 10), {
    type: 'horizontal',
    axis: { x: 10, y: 100 },
    length: 90,
  })
})
