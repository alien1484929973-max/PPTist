import assert from 'node:assert/strict'
import test from 'node:test'
import { matchTextMorphTokens, segmentMorphText } from '../src/textMorph'

test('character Morph keeps grapheme clusters intact', () => {
  assert.deepEqual(segmentMorphText('A👨‍👩‍👧‍👦e\u0301中', 'byChar'), ['A', '👨‍👩‍👧‍👦', 'e\u0301', '中'])
})

test('character Morph uses stable LCS matches for inserted and repeated text', () => {
  const from = segmentMorphText('文字文字', 'byChar')
  const to = segmentMorphText('新文字文字', 'byChar')
  assert.deepEqual(matchTextMorphTokens(from, to), [
    { fromIndex: 0, toIndex: 1 },
    { fromIndex: 1, toIndex: 2 },
    { fromIndex: 2, toIndex: 3 },
    { fromIndex: 3, toIndex: 4 },
  ])
})

test('word Morph segments Chinese text without falling back to code units', () => {
  const segments = segmentMorphText('平滑动画效果', 'byWord')
  assert.equal(segments.join(''), '平滑动画效果')
  assert.ok(segments.length > 0)
})
