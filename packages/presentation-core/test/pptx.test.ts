import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser, XMLSerializer, type Node as XmldomNode } from '@xmldom/xmldom'
import JSZip from 'jszip'
import {
  createLegacyPptAnimations,
  parsePptxImportMetadata,
  type PptxXmlRuntime,
} from '../src/index'

const xmlRuntime: PptxXmlRuntime = {
  parse: source => new DOMParser().parseFromString(source, 'application/xml') as unknown as XMLDocument,
  serialize: node => new XMLSerializer().serializeToString(node as unknown as XmldomNode),
}

const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"
  xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="4" name="!!hero"/>
          <p:cNvSpPr/>
          <p:nvPr><p14:creationId val="{creation-4}"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:transition p14:dur="900">
    <p:extLst>
      <p:ext uri="{9D8B030D-6E8B-4F1D-A177-3A5BDBA764F8}">
        <p159:morph option="byObject"/>
      </p:ext>
    </p:extLst>
  </p:transition>
  <p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="6" presetID="10" presetClass="entr" nodeType="clickEffect" dur="500">
          <p:stCondLst><p:cond delay="250"/></p:stCondLst>
          <p:childTnLst>
            <p:animEffect filter="fade">
              <p:cBhvr>
                <p:cTn id="7" dur="500"/>
                <p:tgtEl><p:spTgt spid="4"/></p:tgtEl>
              </p:cBhvr>
            </p:animEffect>
          </p:childTnLst>
        </p:cTn>
      </p:par>
      <p:par>
        <p:cTn id="9" presetID="1" presetClass="path" nodeType="afterEffect" dur="800">
          <p:childTnLst>
            <p:animMotion path="M 0 0 L 1 1 E">
              <p:cBhvr>
                <p:cTn id="10" dur="800"/>
                <p:tgtEl><p:spTgt spid="4"/></p:tgtEl>
              </p:cBhvr>
            </p:animMotion>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:tnLst>
  </p:timing>
</p:sld>`

test('PPTX metadata parser retains Morph, shape identity, and element timing', async () => {
  const zip = new JSZip()
  zip.file('ppt/slides/slide1.xml', slideXml)
  const buffer = await zip.generateAsync({ type: 'arraybuffer' })

  const result = await parsePptxImportMetadata(buffer, xmlRuntime)
  const slide = result.slides[0]

  assert.equal(slide.transition?.type, 'morph')
  assert.equal(slide.transition?.duration, 900)
  assert.equal(slide.transition?.morph?.mode, 'byObject')
  assert.equal(slide.sourceElements[0].shapeId, '4')
  assert.equal(slide.sourceElements[0].name, '!!hero')
  assert.equal(slide.sourceElements[0].creationId, '{creation-4}')

  const animation = slide.animationTimeline?.animations[0]
  assert.equal(animation?.target.sourceShapeId, '4')
  assert.equal(animation?.timing.duration, 500)
  assert.equal(animation?.timing.delay, 250)
  assert.equal(animation?.timing.trigger, 'click')
  assert.equal(animation?.effect.class, 'entrance')
  assert.equal(animation?.effect.presetId, 10)
  assert.equal(animation?.effect.compatibility, 'mapped')

  const unsupported = slide.animationTimeline?.animations[1]
  assert.equal(unsupported?.effect.class, 'motionPath')
  assert.equal(unsupported?.effect.motionPath, 'M 0 0 L 1 1 E')
  assert.equal(unsupported?.effect.compatibility, 'unsupported')

  const legacy = createLegacyPptAnimations(slide.animationTimeline, shapeId => shapeId === '4' ? 'element-4' : undefined)
  assert.equal(legacy.length, 1)
  assert.equal(legacy[0].elId, 'element-4')
  assert.equal(legacy[0].effect, 'fadeIn')
  assert.equal(legacy[0].delay, 250)
})
