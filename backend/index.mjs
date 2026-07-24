import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { verifyPassword } from './password.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const host = process.env.PPTIST_CLOUD_HOST || '127.0.0.1'
const port = Number(process.env.PPTIST_CLOUD_PORT || 3175)
const databasePath = resolve(process.env.PPTIST_CLOUD_DATABASE || resolve(__dirname, 'data/pptist.sqlite'))
const allowedOrigin = process.env.PPTIST_ALLOWED_ORIGIN || ''
const adminUsername = process.env.PPTIST_ADMIN_USERNAME || 'alien'
const adminPasswordHash = process.env.PPTIST_ADMIN_PASSWORD_HASH || ''
const sessionDays = Number(process.env.PPTIST_SESSION_DAYS || 7)
const maxBodyBytes = Number(process.env.PPTIST_MAX_BODY_BYTES || 50 * 1024 * 1024)

mkdirSync(dirname(databasePath), { recursive: true })

const db = new DatabaseSync(databasePath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS presentations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content_json TEXT NOT NULL,
    slide_count INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_presentations_user_updated
  ON presentations(user_id, updated_at DESC);
`)

const now = () => new Date().toISOString()
const hashToken = token => createHash('sha256').update(token).digest('hex')

const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername)
if (!existingAdmin) {
  if (!adminPasswordHash.startsWith('scrypt$')) {
    throw new Error('PPTIST_ADMIN_PASSWORD_HASH is required to initialize the first user')
  }
  db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(adminUsername, adminPasswordHash, now())
}

db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now())

const sendJson = (res, status, body, extraHeaders = {}) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  })
  res.end(payload)
}

const readJson = async req => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBodyBytes) {
      const error = new Error('payload_too_large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  catch {
    const error = new Error('invalid_json')
    error.status = 400
    throw error
  }
}

const parseCookies = header => Object.fromEntries(String(header || '').split(';').flatMap(item => {
  const index = item.indexOf('=')
  if (index <= 0) return []
  return [[item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim())]]
}))

const getAuthenticatedUser = req => {
  const token = parseCookies(req.headers.cookie).pptist_session
  if (!token || token.length < 32) return null
  return db.prepare(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.disabled = 0
  `).get(hashToken(token), now()) || null
}

const requireUser = (req, res) => {
  const user = getAuthenticatedUser(req)
  if (!user) sendJson(res, 401, { error: 'unauthorized' })
  return user
}

const isMutation = method => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
const hasValidOrigin = req => !allowedOrigin || req.headers.origin === allowedOrigin

const normalizeTitle = value => String(value || '').trim().slice(0, 200) || '未命名演示文稿'
const validateContent = content => {
  if (!content || typeof content !== 'object' || !Array.isArray(content.slides)) return false
  if (!content.slides.length || content.slides.length > 1000) return false
  return content.slides.every(slide => slide && typeof slide.id === 'string' && Array.isArray(slide.elements))
}

const toSummary = row => ({
  id: row.id,
  title: row.title,
  slideCount: row.slide_count,
  revision: row.revision,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const loginAttempts = new Map()
const loginLimit = ip => {
  const key = ip || 'unknown'
  const current = loginAttempts.get(key)
  const timestamp = Date.now()
  if (!current || current.resetAt <= timestamp) {
    loginAttempts.set(key, { count: 0, resetAt: timestamp + 15 * 60 * 1000 })
    return false
  }
  return current.count >= 5
}
const recordLoginFailure = ip => {
  const key = ip || 'unknown'
  const current = loginAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 }
  current.count++
  loginAttempts.set(key, current)
}

const handleRequest = async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = req.method || 'GET'

  if (isMutation(method) && !hasValidOrigin(req)) {
    return sendJson(res, 403, { error: 'invalid_origin' })
  }

  if (method === 'GET' && path === '/api/cloud/health') {
    return sendJson(res, 200, { status: 'ok' })
  }

  if (method === 'POST' && path === '/api/cloud/auth/login') {
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || ''
    if (loginLimit(ip)) return sendJson(res, 429, { error: 'too_many_attempts' })

    const body = await readJson(req)
    const user = db.prepare('SELECT id, username, password_hash, disabled FROM users WHERE username = ?')
      .get(String(body.username || ''))
    const valid = user && !user.disabled && await verifyPassword(String(body.password || ''), user.password_hash)
    if (!valid) {
      recordLoginFailure(ip)
      return sendJson(res, 401, { error: 'invalid_credentials' })
    }

    loginAttempts.delete(ip)
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(user.id, now())
    const token = randomBytes(32).toString('base64url')
    const createdAt = now()
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), user.id, expiresAt, createdAt)

    return sendJson(res, 200, { user: { id: user.id, username: user.username } }, {
      'Set-Cookie': `pptist_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionDays * 86400}`,
    })
  }

  if (method === 'POST' && path === '/api/cloud/auth/logout') {
    const token = parseCookies(req.headers.cookie).pptist_session
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': 'pptist_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    })
  }

  if (method === 'GET' && path === '/api/cloud/auth/me') {
    const user = requireUser(req, res)
    if (!user) return
    return sendJson(res, 200, { user })
  }

  if (path === '/api/cloud/documents' && method === 'GET') {
    const user = requireUser(req, res)
    if (!user) return
    const rows = db.prepare(`
      SELECT id, title, slide_count, revision, created_at, updated_at
      FROM presentations
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all(user.id)
    return sendJson(res, 200, { documents: rows.map(toSummary) })
  }

  if (path === '/api/cloud/documents' && method === 'POST') {
    const user = requireUser(req, res)
    if (!user) return
    const body = await readJson(req)
    if (!validateContent(body.content)) return sendJson(res, 400, { error: 'invalid_content' })

    const id = randomUUID()
    const title = normalizeTitle(body.title || body.content.title)
    const timestamp = now()
    const content = { ...body.content, title }
    db.prepare(`
      INSERT INTO presentations
      (id, user_id, title, content_json, slide_count, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, user.id, title, JSON.stringify(content), content.slides.length, timestamp, timestamp)
    return sendJson(res, 201, { document: {
      id, title, content, slideCount: content.slides.length, revision: 1, createdAt: timestamp, updatedAt: timestamp,
    } })
  }

  const match = path.match(/^\/api\/cloud\/documents\/([0-9a-f-]+)(?:\/(duplicate))?$/i)
  if (!match) return sendJson(res, 404, { error: 'not_found' })

  const user = requireUser(req, res)
  if (!user) return
  const documentId = match[1]

  if (method === 'GET' && !match[2]) {
    const row = db.prepare(`
      SELECT id, title, content_json, slide_count, revision, created_at, updated_at
      FROM presentations WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).get(documentId, user.id)
    if (!row) return sendJson(res, 404, { error: 'not_found' })
    return sendJson(res, 200, { document: { ...toSummary(row), content: JSON.parse(row.content_json) } })
  }

  if (method === 'PUT' && !match[2]) {
    const body = await readJson(req)
    if (!validateContent(body.content) || !Number.isInteger(body.revision)) {
      return sendJson(res, 400, { error: 'invalid_content' })
    }
    const title = normalizeTitle(body.title || body.content.title)
    const content = { ...body.content, title }
    const updatedAt = now()
    const result = db.prepare(`
      UPDATE presentations
      SET title = ?, content_json = ?, slide_count = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND user_id = ? AND revision = ? AND deleted_at IS NULL
    `).run(title, JSON.stringify(content), content.slides.length, updatedAt, documentId, user.id, body.revision)

    if (!result.changes) {
      const current = db.prepare('SELECT revision FROM presentations WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
        .get(documentId, user.id)
      if (!current) return sendJson(res, 404, { error: 'not_found' })
      return sendJson(res, 409, { error: 'version_conflict', currentRevision: current.revision })
    }

    return sendJson(res, 200, { document: {
      id: documentId, title, slideCount: content.slides.length, revision: body.revision + 1, updatedAt,
    } })
  }

  if (method === 'PATCH' && !match[2]) {
    const body = await readJson(req)
    if (!Number.isInteger(body.revision)) return sendJson(res, 400, { error: 'invalid_revision' })
    const title = normalizeTitle(body.title)
    const updatedAt = now()
    const row = db.prepare('SELECT content_json, revision FROM presentations WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(documentId, user.id)
    if (!row) return sendJson(res, 404, { error: 'not_found' })
    if (row.revision !== body.revision) {
      return sendJson(res, 409, { error: 'version_conflict', currentRevision: row.revision })
    }
    const content = { ...JSON.parse(row.content_json), title }
    const result = db.prepare(`
      UPDATE presentations SET title = ?, content_json = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND user_id = ? AND revision = ?
    `).run(title, JSON.stringify(content), updatedAt, documentId, user.id, body.revision)
    if (!result.changes) return sendJson(res, 409, { error: 'version_conflict' })
    return sendJson(res, 200, { document: { id: documentId, title, revision: row.revision + 1, updatedAt } })
  }

  if (method === 'POST' && match[2] === 'duplicate') {
    const row = db.prepare(`
      SELECT title, content_json, slide_count FROM presentations
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).get(documentId, user.id)
    if (!row) return sendJson(res, 404, { error: 'not_found' })
    const id = randomUUID()
    const title = normalizeTitle(`${row.title} - 副本`)
    const content = { ...JSON.parse(row.content_json), title }
    const timestamp = now()
    db.prepare(`
      INSERT INTO presentations
      (id, user_id, title, content_json, slide_count, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, user.id, title, JSON.stringify(content), row.slide_count, timestamp, timestamp)
    return sendJson(res, 201, { document: {
      id, title, content, slideCount: row.slide_count, revision: 1, createdAt: timestamp, updatedAt: timestamp,
    } })
  }

  if (method === 'DELETE' && !match[2]) {
    const updatedAt = now()
    const result = db.prepare(`
      UPDATE presentations SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(updatedAt, updatedAt, documentId, user.id)
    if (!result.changes) return sendJson(res, 404, { error: 'not_found' })
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 405, { error: 'method_not_allowed' })
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    if (error?.status) return sendJson(res, error.status, { error: error.message })
    console.error(`[pptist-cloud] ${req.method} ${req.url}`, error)
    if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' })
    else res.end()
  })
})

server.listen(port, host, () => {
  console.log(`[pptist-cloud] listening on http://${host}:${port}`)
})

const shutdown = () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
