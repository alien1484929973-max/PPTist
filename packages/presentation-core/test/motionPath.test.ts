import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMotionPathKeyframes,
  parsePptxMotionPath,
} from '../src/index'

test('PPTX motion path parses a normalized straight line', () => {
  assert.deepEqual(parsePptxMotionPath('M 0 0 L 1 1 E'), [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ])

  const keyframes = createMotionPathKeyframes('M 0 0 L 1 1 E', 1000, 500)
  assert.deepEqual(keyframes, [
    { transform: 'translate3d(0px, 0px, 0)', offset: 0 },
    { transform: 'translate3d(1000px, 500px, 0)', offset: 1 },
  ])
})

test('PPTX motion path supports relative commands and distance offsets', () => {
  const keyframes = createMotionPathKeyframes('m .1 .2 l .4 0 l 0 .5 e', 1000, 500)
  assert.equal(keyframes[0].transform, 'translate3d(0px, 0px, 0)')
  assert.equal(keyframes[1].transform, 'translate3d(400px, 0px, 0)')
  assert.equal(keyframes[2].transform, 'translate3d(400px, 250px, 0)')
  assert.equal(keyframes[0].offset, 0)
  assert.equal(keyframes[1].offset, 400 / 650)
  assert.equal(keyframes[2].offset, 1)
})

test('PPTX cubic paths are sampled into smooth playback keyframes', () => {
  const points = parsePptxMotionPath('M 0 0 C .2 0 .8 1 1 1 E')
  assert.equal(points.length, 15)
  assert.deepEqual(points[0], { x: 0, y: 0 })
  assert.deepEqual(points.at(-1), { x: 1, y: 1 })
  const keyframes = createMotionPathKeyframes('M 0 0 C .2 0 .8 1 1 1 E', 1000, 500)
  assert.equal(keyframes[0].offset, 0)
  assert.equal(keyframes.at(-1)?.offset, 1)
})
