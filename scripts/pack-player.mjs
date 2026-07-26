import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = join(root, 'release')
const releaseFromRoot = relative(root, releaseDirectory)

if (!releaseFromRoot || releaseFromRoot.startsWith('..') || isAbsolute(releaseFromRoot)) {
  throw new Error(`拒绝写入项目目录以外的路径：${releaseDirectory}`)
}

await rm(releaseDirectory, { recursive: true, force: true })
await mkdir(releaseDirectory, { recursive: true })

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('请通过 npm run pack:player 执行打包')

const { stdout, stderr } = await execFileAsync(
  process.execPath,
  [npmCli, 'pack', '--workspace', 'pptist-presentation-player', '--pack-destination', releaseDirectory],
  { cwd: root, maxBuffer: 4 * 1024 * 1024 },
)
if (stdout.trim()) process.stdout.write(stdout)
if (stderr.trim()) process.stderr.write(stderr)

const packages = (await readdir(releaseDirectory)).filter(name => name.endsWith('.tgz'))
if (packages.length !== 1) {
  throw new Error(`预期生成一个播放器压缩包，实际为 ${packages.length} 个`)
}

const packageName = packages[0]
const packageBuffer = await readFile(join(releaseDirectory, packageName))
const digest = createHash('sha256').update(packageBuffer).digest('hex')
await writeFile(join(releaseDirectory, 'SHA256SUMS.txt'), `${digest}  ${packageName}\n`, 'utf8')
console.log(`播放器依赖包：${join(releaseDirectory, packageName)}`)
console.log(`SHA-256：${digest}`)
