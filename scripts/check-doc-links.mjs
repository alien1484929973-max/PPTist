/* eslint-disable no-console */
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const ignoredDirectories = new Set([
  '.git',
  '.build',
  'dist',
  'node_modules',
  'release',
])

const markdownFiles = async directory => {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await markdownFiles(path))
    else if (extname(entry.name).toLowerCase() === '.md') files.push(path)
  }
  return files
}

const localTarget = (source, rawTarget) => {
  const unwrapped = rawTarget.trim().replace(/^<|>$/g, '')
  if (!unwrapped || unwrapped.startsWith('#')) return undefined
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(unwrapped)) return undefined

  const withoutTitle = unwrapped.match(/^(\S+)(?:\s+["'].*["'])?$/)?.[1] || unwrapped
  const path = decodeURIComponent(withoutTitle.split('#')[0].split('?')[0])
  if (!path) return undefined
  return path.startsWith('/')
    ? resolve(root, path.slice(1))
    : resolve(dirname(source), path)
}

const failures = []
for (const file of await markdownFiles(root)) {
  const markdown = await readFile(file, 'utf8')
  const links = markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)
  for (const match of links) {
    const target = localTarget(file, match[1])
    if (!target) continue
    try {
      await access(target)
    }
    catch {
      failures.push(`${file.slice(root.length + 1)} -> ${match[1]}`)
    }
  }
}

if (failures.length) {
  console.error(`发现 ${failures.length} 个无效的本地 Markdown 链接：`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
}
else {
  console.log('本地 Markdown 链接检查通过')
}
