import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'
import { ensureSchema } from '../backend/database.mjs'

const [sqlitePath, databaseUrlFile = '/etc/pptist-cloud/database-url'] = process.argv.slice(2)
if (!sqlitePath) throw new Error('usage: node scripts/migrate-sqlite-to-postgres.mjs <sqlite-path> [database-url-file]')

const source = new DatabaseSync(sqlitePath, { readOnly: true })
const { Client } = pg
const target = new Client({ connectionString: readFileSync(databaseUrlFile, 'utf8').trim(), application_name: 'pptist-migration' })
await target.connect()

const sourceRows = {
  users: source.prepare('SELECT id, username, password_hash, disabled, created_at FROM users ORDER BY id').all(),
  sessions: source.prepare('SELECT token_hash, user_id, expires_at, created_at FROM sessions ORDER BY token_hash').all(),
  presentations: source.prepare('SELECT id, user_id, title, content_json, slide_count, revision, created_at, updated_at, deleted_at FROM presentations ORDER BY id').all(),
}

try {
  await ensureSchema(target)
  await target.query('BEGIN')
  const existing = await target.query(`
    SELECT (SELECT COUNT(*)::int FROM users) AS users,
           (SELECT COUNT(*)::int FROM sessions) AS sessions,
           (SELECT COUNT(*)::int FROM presentations) AS presentations
  `)
  if (Object.values(existing.rows[0]).some(Number)) throw new Error('target PostgreSQL database is not empty')

  for (const row of sourceRows.users) {
    await target.query(`
      INSERT INTO users (id, username, password_hash, disabled, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [row.id, row.username, row.password_hash, Boolean(row.disabled), row.created_at])
  }
  for (const row of sourceRows.sessions) {
    await target.query(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES ($1, $2, $3, $4)
    `, [row.token_hash, row.user_id, row.expires_at, row.created_at])
  }
  for (const row of sourceRows.presentations) {
    await target.query(`
      INSERT INTO presentations
        (id, user_id, title, content_json, slide_count, revision, created_at, updated_at, deleted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [row.id, row.user_id, row.title, JSON.parse(row.content_json), row.slide_count, row.revision, row.created_at, row.updated_at, row.deleted_at])
  }
  await target.query(`
    SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      COALESCE((SELECT MAX(id) FROM users), 1),
      EXISTS (SELECT 1 FROM users)
    )
  `)
  const migrated = await target.query(`
    SELECT (SELECT COUNT(*)::int FROM users) AS users,
           (SELECT COUNT(*)::int FROM sessions) AS sessions,
           (SELECT COUNT(*)::int FROM presentations) AS presentations
  `)
  const expected = Object.fromEntries(Object.entries(sourceRows).map(([key, rows]) => [key, rows.length]))
  if (JSON.stringify(migrated.rows[0]) !== JSON.stringify(expected)) {
    throw new Error(`row count mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(migrated.rows[0])}`)
  }
  await target.query('COMMIT')
  console.log(JSON.stringify({ source: sqlitePath, migrated: expected }))
}
catch (error) {
  await target.query('ROLLBACK').catch(() => {})
  throw error
}
finally {
  source.close()
  await target.end()
}
