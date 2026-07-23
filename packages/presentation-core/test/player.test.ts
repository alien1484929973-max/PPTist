import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PresentationPlayerController,
  compileTimeline,
  type AnimationTimeline,
  type TimelineAnimation,
} from '../src/index'

const animation = (id: string, trigger: TimelineAnimation['timing']['trigger']): TimelineAnimation => ({
  id,
  target: { elementId: id },
  timing: { duration: 500, delay: 0, trigger },
  effect: { class: 'entrance' },
})

const timeline: AnimationTimeline = {
  version: 1,
  animations: [
    animation('first', 'click'),
    animation('together', 'withPrevious'),
    animation('after', 'afterPrevious'),
  ],
}

test('timeline compiler groups with-previous animations and marks automatic continuation', () => {
  const steps = compileTimeline(timeline)
  assert.deepEqual(steps.map(step => ({
    ids: step.animations.map(item => item.id),
    autoAdvance: step.autoAdvance,
  })), [
    { ids: ['first', 'together'], autoAdvance: true },
    { ids: ['after'], autoAdvance: false },
  ])
})

test('player controller advances animation steps before changing slides', () => {
  const controller = new PresentationPlayerController()
  controller.load([{ id: 'one', animationTimeline: timeline }, { id: 'two' }])

  assert.equal(controller.next().type, 'animations')
  assert.equal(controller.next().type, 'animations')
  assert.deepEqual(controller.next(), { type: 'slide', slideIndex: 1 })
  assert.deepEqual(controller.next(), { type: 'end' })
  assert.deepEqual(controller.previous(), { type: 'slide', slideIndex: 0 })
  assert.equal(controller.stepIndex, 2)
})
