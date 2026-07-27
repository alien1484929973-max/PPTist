import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPresentationMorphCandidates,
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

test('slide entry consumes With Previous during transition and After Previous after transition', () => {
  const controller = new PresentationPlayerController()
  controller.load([
    { id: 'one' },
    {
      id: 'two',
      animationTimeline: {
        version: 1,
        animations: [
          animation('with-transition', 'withPrevious'),
          animation('after-first', 'afterPrevious'),
          animation('wait-for-click', 'click'),
        ],
      },
    },
  ])

  assert.equal(controller.next().type, 'slide')
  const entry = controller.consumeSlideEntryAnimations()
  assert.equal(entry?.phase, 'withTransition')
  assert.deepEqual(entry?.steps.map(step => step.animations.map(item => item.id)), [
    ['with-transition'],
    ['after-first'],
  ])
  assert.equal(controller.stepIndex, 2)
  assert.equal(controller.next().type, 'animations')

  controller.load([{
    id: 'after',
    animationTimeline: {
      version: 1,
      animations: [animation('after-transition', 'afterPrevious')],
    },
  }])
  assert.equal(controller.consumeSlideEntryAnimations()?.phase, 'afterTransition')
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

test('player controller restores a bounded slide and animation cursor', () => {
  const controller = new PresentationPlayerController()
  controller.load([{ id: 'one', animationTimeline: timeline }, { id: 'two' }])

  assert.deepEqual(controller.seek(0, 99), { type: 'slide', slideIndex: 0 })
  assert.equal(controller.stepIndex, 2)
  assert.deepEqual(controller.seek(99, -2), { type: 'slide', slideIndex: 1 })
  assert.equal(controller.stepIndex, 0)
})

test('shared morph candidates preserve PPTist identity and appearance', () => {
  const candidates = createPresentationMorphCandidates([
    {
      id: 'title', type: 'text', left: 10, top: 20, width: 200, height: 40, rotate: 0,
      morphKey: '!!Title', content: '<p>Hello</p>', defaultFontName: 'Arial',
    },
    {
      id: 'line', type: 'line', left: 0, top: 0, width: 2,
      start: [0, 0], end: [100, 20], color: '#000',
    },
  ])

  assert.equal(candidates[0].morphKey, '!!Title')
  assert.equal(candidates[0].name, undefined)
  assert.equal(candidates[0].contentFingerprint, 'hello')
  assert.equal(candidates[1].width, 100)
  assert.equal(candidates[1].height, 24)
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
