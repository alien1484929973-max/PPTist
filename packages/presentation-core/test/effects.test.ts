import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalEffectFromLegacy,
  createAnimationPlan,
  type AnimationDirection,
} from '../src/index'

const hiddenClip: Record<AnimationDirection, string> = {
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
  up: 'inset(0 0 100% 0)',
  down: 'inset(100% 0 0 0)',
}

for (const direction of Object.keys(hiddenClip) as AnimationDirection[]) {
  test(`wipe ${direction} entrance and exit use a hard clip edge`, () => {
    const entrance = createAnimationPlan({ kind: 'wipe', phase: 'entrance', direction }, { duration: 700, delay: 120, trigger: 'click' })
    assert.deepEqual(entrance.keyframes, [
      { clipPath: hiddenClip[direction] },
      { clipPath: 'inset(0 0 0 0)' },
    ])
    assert.equal(entrance.initialVisibility, 'hidden')
    assert.equal(entrance.finalVisibility, 'visible')
    assert.equal(entrance.options.duration, 700)
    assert.equal(entrance.options.delay, 120)

    const exit = createAnimationPlan({ kind: 'wipe', phase: 'exit', direction }, { duration: 700, delay: 0, trigger: 'click' })
    assert.deepEqual(exit.keyframes, [...entrance.keyframes].reverse())
    assert.equal(exit.initialVisibility, 'visible')
    assert.equal(exit.finalVisibility, 'hidden')
  })
}

test('animation timing clamps repetition and retains auto-reverse easing', () => {
  const plan = createAnimationPlan(
    { kind: 'fade', phase: 'entrance' },
    {
      duration: 900,
      delay: 300,
      trigger: 'click',
      repeatCount: 4,
      autoReverse: true,
      easing: 'ease-in-out',
    },
  )
  assert.deepEqual(plan.options, {
    duration: 900,
    delay: 300,
    iterations: 8,
    direction: 'alternate',
    easing: 'ease-in-out',
    fill: 'both',
  })

  const indefinite = createAnimationPlan(
    { kind: 'fade', phase: 'entrance' },
    { duration: 500, delay: 0, trigger: 'click', repeatCount: -1 },
  )
  assert.equal(indefinite.options.iterations, 20)
})

test('legacy editor identifiers map to canonical native effects', () => {
  assert.deepEqual(canonicalEffectFromLegacy('wipeInRight', 'in'), {
    kind: 'wipe', phase: 'entrance', direction: 'right',
  })
  assert.deepEqual(canonicalEffectFromLegacy('wipeOutDown', 'out'), {
    kind: 'wipe', phase: 'exit', direction: 'down',
  })
  assert.deepEqual(canonicalEffectFromLegacy('spin', 'attention'), {
    kind: 'spin', phase: 'emphasis',
  })
})
