import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser, XMLSerializer, type Node as XmldomNode } from '@xmldom/xmldom'
import JSZip from 'jszip'
import {
  analyzePptxExportCompatibility,
  editorTurningModeTransition,
  parsePptxImportMetadata,
  resolvePptxExportTimeline,
  writePptxTiming,
  writePptxTransition,
  type PptxXmlRuntime,
} from '../src/index'

const xmlRuntime: PptxXmlRuntime = {
  parse: source => new DOMParser().parseFromString(source, 'application/xml') as unknown as XMLDocument,
  serialize: node => new XMLSerializer().serializeToString(node as unknown as XmldomNode),
}

test('PPTX export keeps the editor default vertical slide transition', () => {
  assert.deepEqual(editorTurningModeTransition(), {
    type: 'push', direction: 'u', duration: 700, source: 'editor',
  })
  assert.equal(editorTurningModeTransition('no')?.type, 'none')
})

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
  assert.match(timing, /nodeType="tmRoot"/)
  assert.match(timing, /nodeType="mainSeq"/)
  assert.match(timing, /<p:cond delay="indefinite"\/>/)
})

test('PPTX export resolves legacy-only animations and expands group targets', () => {
  const timeline = resolvePptxExportTimeline({
    animations: [{
      id: 'legacy-fly',
      elId: 'group-one',
      target: { groupId: 'group-one' },
      effect: 'flyIn',
      direction: 'down',
      type: 'in',
      duration: 650,
      delay: 80,
      trigger: 'auto',
    }],
    elements: [
      { id: 'member-a', type: 'shape', groupId: 'group-one' },
      { id: 'member-b', type: 'text', groupId: 'group-one' },
    ],
  })

  assert.deepEqual(timeline?.animations.map(animation => animation.target.elementId), ['member-a', 'member-b'])
  const timing = writePptxTiming(timeline, { 'member-a': '4', 'member-b': '5' })
  assert.match(timing, /presetID="2"/)
  assert.match(timing, /presetSubtype="4"/)
  assert.match(timing, /nodeType="afterEffect"/)
  assert.match(timing, /<p:cond delay="0"\/>/)
  assert.match(timing, /val="1\+#ppt_h\/2"/)
})

test('PPTX timing round-trips triggers, directions, durations, and transition metadata', async () => {
  const timeline = resolvePptxExportTimeline({
    animations: [
      {
        id: 'wipe', elId: '4', effect: 'wipeIn', direction: 'left', type: 'in',
        duration: 700, delay: 100, trigger: 'click', easing: 'ease-in-out',
      },
      {
        id: 'fly', elId: '5', effect: 'flyOut', direction: 'bottomRight', type: 'out',
        duration: 500, trigger: 'meantime',
      },
      {
        id: 'fade', elId: '6', effect: 'fadeIn', type: 'in',
        duration: 400, delay: 25, trigger: 'auto',
      },
    ],
    elements: [],
  })
  const timing = writePptxTiming(timeline, { '4': '4', '5': '5', '6': '6' })
  const transition = writePptxTransition({ type: 'push', direction: 'l', duration: 700 })
  const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">
      <p:cSld><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="4" name="wipe"/></p:nvSpPr></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="5" name="fly"/></p:nvSpPr></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="6" name="fade"/></p:nvSpPr></p:sp>
      </p:spTree></p:cSld>${transition}${timing}</p:sld>`
  const zip = new JSZip()
  zip.file('ppt/slides/slide1.xml', slideXml)
  const result = await parsePptxImportMetadata(await zip.generateAsync({ type: 'arraybuffer' }), xmlRuntime)
  const slide = result.slides[0]

  assert.equal(slide.transition?.type, 'push')
  assert.equal(slide.transition?.direction, 'l')
  assert.equal(slide.transition?.duration, 700)
  assert.deepEqual(slide.animationTimeline?.animations.map(animation => ({
    shape: animation.target.sourceShapeId,
    trigger: animation.timing.trigger,
    duration: animation.timing.duration,
    delay: animation.timing.delay,
    canonical: animation.effect.canonical,
  })), [
    {
      shape: '4', trigger: 'click', duration: 700, delay: 100,
      canonical: { kind: 'wipe', phase: 'entrance', direction: 'left' },
    },
    {
      shape: '5', trigger: 'withPrevious', duration: 500, delay: 0,
      canonical: { kind: 'fly', phase: 'exit', direction: 'bottomRight' },
    },
    {
      shape: '6', trigger: 'afterPrevious', duration: 400, delay: 25,
      canonical: { kind: 'fade', phase: 'entrance' },
    },
  ])
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
