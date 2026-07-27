import { chmod, cp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const stagedDist = join(root, '.build', 'unified-dist')
const finalDist = join(root, 'dist')

await rm(stagedDist, { recursive: true, force: true })
await mkdir(stagedDist, { recursive: true })
await cp(join(root, '.build', 'frontend'), join(stagedDist, 'public'), { recursive: true })
await cp(join(root, 'backend'), join(stagedDist, 'backend'), { recursive: true })
const downloads = join(stagedDist, 'public', 'downloads')
await mkdir(downloads, { recursive: true })
for (const entry of await readdir(join(root, 'release'))) {
  if (entry.endsWith('.tgz') || entry === 'SHA256SUMS.txt') {
    await cp(join(root, 'release', entry), join(downloads, entry))
  }
}
await cp(
  join(root, 'docs', 'presentation-player-usage.md'),
  join(downloads, 'presentation-player-usage.md'),
)
await chmod(join(stagedDist, 'backend'), 0o755)
for (const entry of await readdir(join(stagedDist, 'backend'))) {
  if (entry.endsWith('.mjs') || entry.endsWith('.md')) {
    await chmod(join(stagedDist, 'backend', entry), 0o644)
  }
}
await rm(finalDist, { recursive: true, force: true })
try {
  await rename(stagedDist, finalDist)
}
catch (error) {
  // Windows can temporarily deny a directory rename when antivirus/indexing
  // has a handle open. Copying the already assembled tree is an equivalent,
  // reliable fallback and keeps the production build deterministic.
  if (error?.code !== 'EPERM' && error?.code !== 'EXDEV') throw error
  await cp(stagedDist, finalDist, { recursive: true })
  await rm(stagedDist, { recursive: true, force: true })
}
console.log(`统一生产目录已生成：${finalDist}`)
