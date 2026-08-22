import assert from 'node:assert/strict'
import test from 'node:test'
import type { PPTImageElement, Slide } from '@/types/slides'
import { createImageBackgroundUpdate } from '../slideBackground'

test('moves an image into the slide background and removes stale editor state', () => {
  const image = {
    id: 'background-image',
    type: 'image',
    src: 'https://example.com/background.png',
    groupId: 'group-1',
  } as PPTImageElement
  const slide = {
    id: 'slide-1',
    elements: [
      image,
      { id: 'remaining-shape', type: 'shape', groupId: 'group-1' },
    ],
    animations: [
      { id: 'legacy-image-animation', elId: image.id },
      { id: 'legacy-shape-animation', elId: 'remaining-shape' },
    ],
    animationTimeline: {
      animations: [
        { id: 'image-animation', target: { elementId: image.id } },
        { id: 'shape-animation', target: { elementId: 'remaining-shape' } },
        { id: 'group-animation', target: { groupId: 'group-1' } },
      ],
    },
  } as Slide

  const update = createImageBackgroundUpdate(slide, image)

  assert.deepEqual(update.background, {
    type: 'image',
    image: { src: image.src, size: 'cover' },
  })
  assert.equal(update.elements.length, 1)
  assert.equal(update.elements[0].id, 'remaining-shape')
  assert.equal(update.elements[0].groupId, undefined)
  assert.deepEqual(update.animations?.map(animation => animation.id), ['legacy-shape-animation'])
  assert.deepEqual(update.animationTimeline?.animations.map(animation => animation.id), ['shape-animation'])
})
