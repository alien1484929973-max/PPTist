import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const bundle = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
const declarations = await readFile(new URL('../src/public.d.ts', import.meta.url), 'utf8')
const packageEntryUrl = new URL(`../${packageJson.exports['.'].import}`, import.meta.url)

assert.equal(packageJson.dependencies?.vue, undefined, 'Vue must not be a package dependency')
assert.equal(packageJson.peerDependencies?.vue, undefined, 'Vue must not be a peer dependency')
assert.doesNotMatch(bundle, /(?:from|import\s*)\s*['"]vue(?:\/[^'"]*)?['"]/, 'bundle must not import Vue')
assert.doesNotMatch(bundle, /@pptist\/presentation-core/, 'bundle must contain the private core instead of importing workspace source')
assert.match(declarations, /createPresentationPlayer/, 'public declarations must expose createPresentationPlayer')
assert.match(declarations, /renderPresentationChart/, 'public declarations must expose the chart adapter')
assert.match(declarations, /analyzePresentationCompatibility/, 'public declarations must expose compatibility auditing')
assert.match(declarations, /readPlayerDocument/, 'public declarations must expose JSON/File loading')
assert.match(declarations, /analyzePresentationResources/, 'public declarations must expose resource auditing')

const publicApi = await import(packageEntryUrl.href)
for (const name of [
  'createPresentationPlayer',
  'parsePlayerDocument',
  'readPlayerDocument',
  'analyzePresentationCompatibility',
  'analyzePresentationResources',
]) assert.equal(typeof publicApi[name], 'function', `built entry must export ${name}`)

const json = JSON.stringify({
  schemaVersion: 2,
  width: 1000,
  height: 562.5,
  slides: [{
    id: 'package-smoke',
    elements: [{ id: 'image', type: 'image', left: 0, top: 0, width: 100, height: 100, src: './media/photo.png' }],
  }],
})
assert.equal(publicApi.parsePlayerDocument(json).slides[0].id, 'package-smoke')
assert.equal(publicApi.analyzePresentationResources(publicApi.parsePlayerDocument(json), {
  baseUrl: 'https://cdn.example.test/decks/demo.json',
}).portable, true)

const window = new Window({ url: 'https://consumer.example.test/' })
const host = window.document.createElement('div')
Object.defineProperties(host, {
  clientWidth: { value: 1000 },
  clientHeight: { value: 562.5 },
})
window.document.body.appendChild(host)
const player = publicApi.createPresentationPlayer(host, json, {
  resourceBaseUrl: 'https://cdn.example.test/decks/demo.json',
})
assert.equal(player.state.slideCount, 1)
assert.equal(host.querySelector('img')?.src, 'https://cdn.example.test/decks/media/photo.png')
player.destroy()
await window.happyDOM.abort()

// eslint-disable-next-line no-console
console.log(`Verified ${packageJson.name}@${packageJson.version}: built ESM, declarations, JSON/media contract, DOM smoke, no Vue runtime.`)
