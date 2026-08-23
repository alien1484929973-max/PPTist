import assert from 'node:assert/strict'
import test from 'node:test'
import { pptxArrowKeypointValues } from '../pptxImport'

test('maps horizontal PPTX arrow adjustments to head length and shaft thickness', () => {
  assert.deepEqual(
    pptxArrowKeypointValues('rightArrow', { adj1: 0.8, adj2: 1.2 }, 400, 200),
    [0.3, 0.4],
  )
  assert.deepEqual(
    pptxArrowKeypointValues('leftRightArrow', { adj1: 1, adj2: 1 }, 200, 200),
    [0.5, 0.5],
  )
})

test('maps vertical PPTX arrow adjustments using the short axis', () => {
  assert.deepEqual(
    pptxArrowKeypointValues('upArrow', { adj1: 0.6, adj2: 0.5 }, 120, 240),
    [0.125, 0.3],
  )
  assert.deepEqual(
    pptxArrowKeypointValues('upDownArrow', undefined, 200, 200),
    [0.25, 0.5],
  )
})

test('ignores non-arrow presets', () => {
  assert.equal(pptxArrowKeypointValues('rect', { adj1: 1, adj2: 1 }, 200, 100), undefined)
})
