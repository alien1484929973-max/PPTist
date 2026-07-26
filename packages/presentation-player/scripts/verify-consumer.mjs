import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('npm_execpath is required to verify the packed consumer')
const execNpm = (args, options) => exec(process.execPath, [npmCli, ...args], options)
const packageDirectory = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const typescriptCli = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url))
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'pptist-player-consumer-'))
const packDirectory = join(temporaryDirectory, 'pack')
const consumerDirectory = join(temporaryDirectory, 'consumer')

try {
  await mkdir(packDirectory)
  await mkdir(consumerDirectory)
  const { stdout } = await execNpm([
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    packDirectory,
  ], { cwd: packageDirectory, maxBuffer: 10 * 1024 * 1024 })
  const packResult = JSON.parse(stdout)
  assert.equal(packResult.length, 1, 'npm pack must produce exactly one tarball')
  const tarball = join(packDirectory, packResult[0].filename)
  await readFile(tarball)

  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
    name: 'pptist-player-isolated-consumer',
    private: true,
    type: 'module',
  }, null, 2), 'utf8')
  await execNpm([
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--prefer-offline',
    tarball,
  ], { cwd: consumerDirectory, maxBuffer: 10 * 1024 * 1024 })

  const smokeFile = join(consumerDirectory, 'smoke.mjs')
  await writeFile(smokeFile, `
import assert from 'node:assert/strict'
import {
  analyzePresentationResources,
  parsePlayerDocument,
  readPlayerDocument,
} from 'pptist-presentation-player'

const json = JSON.stringify({
  schemaVersion: 2,
  width: 1000,
  height: 562.5,
  slides: [{ id: 'consumer', elements: [{
    id: 'audio', type: 'audio', left: 0, top: 0, width: 40, height: 40,
    src: 'https://media.example.test/audio.mp3',
  }] }],
})
const document = parsePlayerDocument(json)
assert.equal((await readPlayerDocument(new Blob([json]))).slides[0].id, 'consumer')
assert.equal(analyzePresentationResources(document).portable, true)
`, 'utf8')
  await exec(process.execPath, [smokeFile], { cwd: consumerDirectory, maxBuffer: 10 * 1024 * 1024 })

  const typeSmokeFile = join(consumerDirectory, 'smoke.ts')
  await writeFile(typeSmokeFile, `
import {
  analyzePresentationResources,
  createPresentationPlayer,
  parsePlayerDocument,
  readPlayerDocument,
  type PlayerDocument,
  type PlayerResourceReport,
} from 'pptist-presentation-player'

const source = '{"width":1000,"height":562.5,"slides":[]}'
const presentation: PlayerDocument = parsePlayerDocument(source)
const report: PlayerResourceReport = analyzePresentationResources(presentation)
const pending: Promise<PlayerDocument> = readPlayerDocument(new Blob([source]))
const player = createPresentationPlayer(document.createElement('div'), source)
void [report, pending, player]
`, 'utf8')
  await exec(process.execPath, [
    typescriptCli,
    '--noEmit',
    '--strict',
    '--target', 'ES2020',
    '--module', 'ESNext',
    '--moduleResolution', 'Bundler',
    '--lib', 'ES2020,DOM',
    '--skipLibCheck', 'false',
    typeSmokeFile,
  ], { cwd: consumerDirectory, maxBuffer: 10 * 1024 * 1024 })

  // eslint-disable-next-line no-console
  console.log(`Verified isolated npm install and TypeScript consumer from ${packResult[0].filename}.`)
}
finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
