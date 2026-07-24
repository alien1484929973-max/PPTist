import assert from 'node:assert/strict'
import test from 'node:test'
import { timelineForSlide, timelineFromLegacyAnimations } from '../src/index'

test('legacy editor animations become a framework-independent timeline', () => {
  const timeline = timelineFromLegacyAnimations([
    {
      id: 'first',
      elId: 'title',
      type: 'in',
      effect: 'wipeIn',
      direction: 'left',
      duration: 600,
      delay: 100,
      trigger: 'click',
    },
    {
      id: 'second',
      elId: 'image',
      type: 'in',
      effect: 'fadeIn',
      duration: 400,
      trigger: 'meantime',
    },
  ])

  assert.equal(timeline.animations[0].effect.canonical?.kind, 'wipe')
  assert.equal(timeline.animations[0].timing.trigger, 'click')
  assert.equal(timeline.animations[1].timing.trigger, 'withPrevious')
  assert.deepEqual(timeline.animations[1].target, { elementId: 'image' })
})

test('native timelines are preferred and group targets remain groups', () => {
  const nativeTimeline = {
    version: 1 as const,
    animations: [{
      id: 'group',
      target: { groupId: 'group-one' },
      timing: { duration: 500, delay: 0, trigger: 'click' as const },
      effect: {
        class: 'entrance' as const,
        canonical: { kind: 'fade' as const, phase: 'entrance' as const },
      },
    }],
  }
  const result = timelineForSlide({
    id: 'slide',
    elements: [],
    animationTimeline: nativeTimeline,
  })
  assert.equal(result, nativeTimeline)
  assert.deepEqual(result.animations[0].target, { groupId: 'group-one' })
})
