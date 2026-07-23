import assert from 'node:assert/strict'
import test from 'node:test'
import { matchMorphElements, type MorphableElement } from '../src/index'

const element = (id: string, left: number, name: string): MorphableElement => ({
  id,
  type: 'shape',
  left,
  top: 0,
  width: 100,
  height: 100,
  rotate: 0,
  name,
})

test('Morph gives explicit !! names priority over inferred geometry', () => {
  const result = matchMorphElements(
    [element('from-forced', 0, '!!hero'), element('from-near', 290, 'other')],
    [element('to-forced', 300, '!!hero'), element('to-near', 295, 'other')],
  )

  assert.deepEqual(result.matches.map(match => [match.from.id, match.to.id, match.confidence]), [
    ['from-forced', 'to-forced', 'forced'],
    ['from-near', 'to-near', 'strong'],
  ])
  assert.equal(result.entering.length, 0)
  assert.equal(result.leaving.length, 0)
})

test('Morph does not pair incompatible element types', () => {
  const from = element('shape', 0, 'item')
  const to = { ...element('image', 0, 'item'), type: 'image' }
  const result = matchMorphElements([from], [to])

  assert.equal(result.matches.length, 0)
  assert.deepEqual(result.leaving.map(item => item.id), ['shape'])
  assert.deepEqual(result.entering.map(item => item.id), ['image'])
})
