import { rm } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const targets = [
  '.build/frontend',
  '.build/unified-dist',
  'dist',
  'release',
  'packages/presentation-player/dist',
  'tsconfig.app.tsbuildinfo',
  'tsconfig.node.tsbuildinfo',
]

for (const target of targets) {
  const path = resolve(root, target)
  const pathFromRoot = relative(root, path)
  if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw new Error(`拒绝清理项目目录以外的路径：${path}`)
  }
  await rm(path, { recursive: true, force: true })
  console.log(`已清理 ${pathFromRoot}`)
}
