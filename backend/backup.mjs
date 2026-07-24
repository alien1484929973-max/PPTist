import { chmodSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const databaseUrlFile = process.argv[2] || process.env.PPTIST_DATABASE_URL_FILE || '/etc/pptist-cloud/database-url'
const backupDirectory = process.argv[3]
const retention = Math.max(1, Number(process.env.PPTIST_BACKUP_RETENTION || 30))
if (!backupDirectory) throw new Error('backup directory is required')

const url = new URL(readFileSync(databaseUrlFile, 'utf8').trim())
mkdirSync(backupDirectory, { recursive: true })
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const target = resolve(backupDirectory, `pptist-${stamp}-${process.pid}.dump`)
const result = spawnSync('/usr/pgsql-18/bin/pg_dump', [
  '--host', url.hostname,
  '--port', url.port || '5432',
  '--username', decodeURIComponent(url.username),
  '--dbname', url.pathname.slice(1),
  '--format', 'custom',
  '--file', target,
], {
  env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
  encoding: 'utf8',
})
if (result.status !== 0) throw new Error(result.stderr.trim() || `pg_dump exited ${result.status}`)
chmodSync(target, 0o600)

const backups = readdirSync(backupDirectory)
  .filter(file => /^pptist-\d+-\d+\.dump$/.test(file))
  .map(file => ({ file, modified: statSync(resolve(backupDirectory, file)).mtimeMs }))
  .sort((a, b) => b.modified - a.modified)
for (const backup of backups.slice(retention)) unlinkSync(resolve(backupDirectory, backup.file))
console.log(`[pptist-cloud-backup] created ${basename(target)}`)
