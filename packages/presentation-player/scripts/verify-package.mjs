import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const bundle = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
const declarations = await readFile(new URL('../src/public.d.ts', import.meta.url), 'utf8')

assert.equal(packageJson.dependencies?.vue, undefined, 'Vue must not be a package dependency')
assert.equal(packageJson.peerDependencies?.vue, undefined, 'Vue must not be a peer dependency')
assert.doesNotMatch(bundle, /(?:from|import\s*)\s*['"]vue(?:\/[^'"]*)?['"]/, 'bundle must not import Vue')
assert.match(declarations, /createPresentationPlayer/, 'public declarations must expose createPresentationPlayer')
assert.match(declarations, /renderPresentationChart/, 'public declarations must expose the chart adapter')
assert.match(declarations, /analyzePresentationCompatibility/, 'public declarations must expose compatibility auditing')

// eslint-disable-next-line no-console
console.log(`Verified ${packageJson.name}@${packageJson.version}: ESM, types, charts, compatibility API, no Vue runtime.`)
