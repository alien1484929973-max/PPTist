import assert from 'node:assert/strict'
import test from 'node:test'
import { isPrivateAddress, parseExportImageUrl } from './export-image.mjs'

test('blocks private and reserved network addresses', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isPrivateAddress(address), true, address)
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false)
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false)
})

test('accepts ordinary public HTTP image URLs', () => {
  assert.equal(parseExportImageUrl('https://images.example.com/a.png?size=2').hostname, 'images.example.com')
})

test('rejects unsafe image proxy targets', () => {
  for (const source of [
    'file:///etc/passwd',
    'http://localhost/image.png',
    'http://127.0.0.1/image.png',
    'https://user:secret@example.com/image.png',
    'https://example.com:8443/image.png',
  ]) {
    assert.throws(() => parseExportImageUrl(source), { name: 'Error' }, source)
  }
})
