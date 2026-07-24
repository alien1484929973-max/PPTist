import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

const databasePath = process.argv[2]
const backupDirectory = process.argv[3]
const retention = Math.max(1, Number(process.env.PPTIST_BACKUP_RETENTION || 30))

if (!databasePath || !backupDirectory) {
  throw new Error('database path and backup directory are required')
}

mkdirSync(backupDirectory, { recursive: true })
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const target = resolve(backupDirectory, `pptist-${stamp}-${process.pid}.sqlite`)
const escapedTarget = target.replaceAll("'", "''")
const database = new DatabaseSync(databasePath)

try {
  database.exec('PRAGMA busy_timeout = 10000')
  database.exec(`VACUUM INTO '${escapedTarget}'`)
}
finally {
  database.close()
}

const backups = readdirSync(backupDirectory)
  .filter(file => /^pptist-\d+-\d+\.sqlite$/.test(file))
  .map(file => ({ file, modified: statSync(resolve(backupDirectory, file)).mtimeMs }))
  .sort((a, b) => b.modified - a.modified)

for (const backup of backups.slice(retention)) {
  unlinkSync(resolve(backupDirectory, backup.file))
}

console.log(`[pptist-cloud-backup] created ${basename(target)}`)
