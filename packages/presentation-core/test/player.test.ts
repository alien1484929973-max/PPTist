import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PresentationPlayerController,
  compileAnimationSteps,
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

test('timeline compiler keeps simultaneous paragraph targets on the same element', () => {
  const scopedTimeline: AnimationTimeline = {
    version: 1,
    animations: [
      { ...animation('paragraph-one', 'click'), target: { elementId: 'text', paragraphIndex: 0 } },
      { ...animation('paragraph-two', 'withPrevious'), target: { elementId: 'text', paragraphIndex: 1 } },
      { ...animation('replace-two', 'withPrevious'), target: { elementId: 'text', paragraphIndex: 1 } },
    ],
  }
  assert.deepEqual(
    compileTimeline(scopedTimeline)[0].animations.map(item => item.id),
    ['paragraph-one', 'replace-two'],
  )
})

test('timeline compiler treats a group as one stable animation target', () => {
  const grouped: AnimationTimeline = {
    version: 1,
    animations: [
      { ...animation('group-in', 'click'), target: { groupId: 'group-one' } },
      { ...animation('group-replace', 'withPrevious'), target: { groupId: 'group-one' } },
    ],
  }
  assert.deepEqual(compileTimeline(grouped)[0].animations.map(item => item.id), ['group-replace'])
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

test('framework-independent compiler also handles editor trigger adapters', () => {
  const editorAnimations = [
    { id: 'one', target: 'a', trigger: 'click' },
    { id: 'replace-one', target: 'a', trigger: 'meantime' },
    { id: 'together', target: 'b', trigger: 'meantime' },
    { id: 'after', target: 'c', trigger: 'auto' },
  ] as const
  const steps = compileAnimationSteps(
    editorAnimations,
    item => item.trigger === 'meantime' ? 'withPrevious' : item.trigger === 'auto' ? 'afterPrevious' : 'click',
    item => item.target,
  )
  assert.deepEqual(steps.map(step => ({
    ids: step.animations.map(item => item.id),
    autoAdvance: step.autoAdvance,
  })), [
    { ids: ['replace-one', 'together'], autoAdvance: true },
    { ids: ['after'], autoAdvance: false },
  ])
})
