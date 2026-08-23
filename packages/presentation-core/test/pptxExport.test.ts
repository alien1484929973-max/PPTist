import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzePptxExportCompatibility,
  writePptxTiming,
  writePptxTransition,
} from '../src/index'

test('PPTX export writes Morph and mapped element timing', () => {
  const transition = writePptxTransition({
    type: 'morph',
    duration: 900,
    morph: { mode: 'byWord' },
  })
  assert.match(transition, /p159:morph option="byWord"/)
  assert.match(transition, /p14:dur="900"/)

  const timing = writePptxTiming({
    version: 1,
    animations: [{
      id: 'fade-title',
      target: { elementId: 'title' },
      timing: { duration: 500, delay: 120, trigger: 'click' },
      effect: {
        class: 'entrance',
        canonical: { kind: 'fade', phase: 'entrance' },
      },
    }],
  }, { title: '4' })
  assert.match(timing, /presetID="10"/)
  assert.match(timing, /spid="4"/)
  assert.match(timing, /delay="120"/)
})

test('PPTX export compatibility reports widgets and unsupported effects instead of dropping them silently', () => {
  const report = analyzePptxExportCompatibility([{
    id: 'slide-one',
    elements: [{ id: 'widget', type: 'widget' }],
    animationTimeline: {
      version: 1,
      animations: [{
        id: 'unknown',
        target: { elementId: 'widget' },
        timing: { duration: 300, delay: 0, trigger: 'click' },
        effect: { class: 'unknown' },
      }],
    },
  }])
  assert.equal(report.status, 'unsupported')
  assert.equal(report.counts.flattened, 1)
  assert.equal(report.counts.unsupported, 1)
})
