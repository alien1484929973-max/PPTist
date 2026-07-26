import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import process from 'node:process'
import { createDatabasePool, ensureSchema } from './database.mjs'
import {
  deleteMediaCredential,
  getMediaSettings,
  saveMediaCredential,
  uploadDocumentMedia,
} from './media.mjs'
import { verifyPassword } from './password.mjs'

const host = process.env.PPTIST_CLOUD_HOST || '127.0.0.1'
const port = Number(process.env.PPTIST_CLOUD_PORT || 3175)
const allowedOrigin = process.env.PPTIST_ALLOWED_ORIGIN || ''
const adminUsername = process.env.PPTIST_ADMIN_USERNAME || 'alien'
const adminPasswordHash = process.env.PPTIST_ADMIN_PASSWORD_HASH || ''
const sessionDays = Number(process.env.PPTIST_SESSION_DAYS || 7)
const maxBodyBytes = Number(process.env.PPTIST_MAX_BODY_BYTES || 50 * 1024 * 1024)
const pool = createDatabasePool()

await ensureSchema(pool)
const existingAdmin = await pool.query('SELECT id FROM users WHERE username = $1', [adminUsername])
if (!existingAdmin.rowCount) {
  if (!adminPasswordHash.startsWith('scrypt$')) {
    throw new Error('PPTIST_ADMIN_PASSWORD_HASH is required to initialize the first user')
  }
  await pool.query(
    'INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, NOW())',
    [adminUsername, adminPasswordHash],
  )
}
await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()')

const hashToken = token => createHash('sha256').update(token).digest('hex')

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

const getAuthenticatedUser = async req => {
  const token = parseCookies(req.headers.cookie).pptist_session
  if (!token || token.length < 32) return null
  const result = await pool.query(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW() AND users.disabled = FALSE
  `, [hashToken(token)])
  return result.rows[0] || null
}

const requireUser = async (req, res) => {
  const user = await getAuthenticatedUser(req)
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
    await pool.query('SELECT 1')
    return sendJson(res, 200, { status: 'ok', database: 'postgresql' })
  }

  if (method === 'POST' && path === '/api/cloud/auth/login') {
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || ''
    if (loginLimit(ip)) return sendJson(res, 429, { error: 'too_many_attempts' })
    const body = await readJson(req)
    const result = await pool.query(
      'SELECT id, username, password_hash, disabled FROM users WHERE username = $1',
      [String(body.username || '')],
    )
    const user = result.rows[0]
    const valid = user && !user.disabled && await verifyPassword(String(body.password || ''), user.password_hash)
    if (!valid) {
      recordLoginFailure(ip)
      return sendJson(res, 401, { error: 'invalid_credentials' })
    }

    loginAttempts.delete(ip)
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= NOW()', [user.id])
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000)
    await pool.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, NOW())',
      [hashToken(token), user.id, expiresAt],
    )
    return sendJson(res, 200, { user: { id: user.id, username: user.username } }, {
      'Set-Cookie': `pptist_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionDays * 86400}`,
    })
  }

  if (method === 'POST' && path === '/api/cloud/auth/logout') {
    const token = parseCookies(req.headers.cookie).pptist_session
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': 'pptist_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    })
  }

  if (method === 'GET' && path === '/api/cloud/auth/me') {
    const user = await requireUser(req, res)
    if (!user) return
    return sendJson(res, 200, { user })
  }

  if (path === '/api/cloud/media/settings') {
    const user = await requireUser(req, res)
    if (!user) return
    if (method === 'GET') {
      return sendJson(res, 200, { settings: await getMediaSettings(pool, user.id) })
    }
    if (method === 'PUT') {
      const body = await readJson(req)
      const settings = await saveMediaCredential(pool, user.id, body.apiKey)
      return sendJson(res, 200, { settings })
    }
    if (method === 'DELETE') {
      await deleteMediaCredential(pool, user.id)
      return sendJson(res, 200, { ok: true })
    }
    return sendJson(res, 405, { error: 'method_not_allowed' })
  }

  const mediaUploadMatch = path.match(/^\/api\/cloud\/documents\/([0-9a-f-]+)\/media$/i)
  if (mediaUploadMatch) {
    if (method !== 'PUT') return sendJson(res, 405, { error: 'method_not_allowed' })
    const user = await requireUser(req, res)
    if (!user) return
    const result = await uploadDocumentMedia({
      req,
      pool,
      user,
      documentId: mediaUploadMatch[1],
      requestUrl: url,
    })
    return sendJson(res, 201, result)
  }

  if (path === '/api/cloud/documents' && method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return
    const result = await pool.query(`
      SELECT id, title, slide_count, revision, created_at, updated_at
      FROM presentations
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `, [user.id])
    return sendJson(res, 200, { documents: result.rows.map(toSummary) })
  }

  if (path === '/api/cloud/documents' && method === 'POST') {
    const user = await requireUser(req, res)
    if (!user) return
    const body = await readJson(req)
    if (!validateContent(body.content)) return sendJson(res, 400, { error: 'invalid_content' })
    const id = randomUUID()
    const title = normalizeTitle(body.title || body.content.title)
    const content = { ...body.content, title }
    const result = await pool.query(`
      INSERT INTO presentations
        (id, user_id, title, content_json, slide_count, revision, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
      RETURNING created_at, updated_at
    `, [id, user.id, title, content, content.slides.length])
    return sendJson(res, 201, { document: {
      id, title, content, slideCount: content.slides.length, revision: 1,
      createdAt: result.rows[0].created_at, updatedAt: result.rows[0].updated_at,
    } })
  }

  const match = path.match(/^\/api\/cloud\/documents\/([0-9a-f-]+)(?:\/(duplicate))?$/i)
  if (!match) return sendJson(res, 404, { error: 'not_found' })
  const user = await requireUser(req, res)
  if (!user) return
  const documentId = match[1]

  if (method === 'GET' && !match[2]) {
    const result = await pool.query(`
      SELECT id, title, content_json, slide_count, revision, created_at, updated_at
      FROM presentations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    `, [documentId, user.id])
    const row = result.rows[0]
    if (!row) return sendJson(res, 404, { error: 'not_found' })
    return sendJson(res, 200, { document: { ...toSummary(row), content: row.content_json } })
  }

  if (method === 'PUT' && !match[2]) {
    const body = await readJson(req)
    if (!validateContent(body.content) || !Number.isInteger(body.revision)) {
      return sendJson(res, 400, { error: 'invalid_content' })
    }
    const title = normalizeTitle(body.title || body.content.title)
    const content = { ...body.content, title }
    const result = await pool.query(`
      UPDATE presentations
      SET title = $1, content_json = $2, slide_count = $3, revision = revision + 1, updated_at = NOW()
      WHERE id = $4 AND user_id = $5 AND revision = $6 AND deleted_at IS NULL
      RETURNING revision, updated_at
    `, [title, content, content.slides.length, documentId, user.id, body.revision])
    if (!result.rowCount) {
      const current = await pool.query(
        'SELECT revision FROM presentations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [documentId, user.id],
      )
      if (!current.rowCount) return sendJson(res, 404, { error: 'not_found' })
      return sendJson(res, 409, { error: 'version_conflict', currentRevision: current.rows[0].revision })
    }
    return sendJson(res, 200, { document: {
      id: documentId, title, slideCount: content.slides.length,
      revision: result.rows[0].revision, updatedAt: result.rows[0].updated_at,
    } })
  }

  if (method === 'PATCH' && !match[2]) {
    const body = await readJson(req)
    if (!Number.isInteger(body.revision)) return sendJson(res, 400, { error: 'invalid_revision' })
    const title = normalizeTitle(body.title)
    const current = await pool.query(
      'SELECT content_json, revision FROM presentations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [documentId, user.id],
    )
    const row = current.rows[0]
    if (!row) return sendJson(res, 404, { error: 'not_found' })
    if (row.revision !== body.revision) {
      return sendJson(res, 409, { error: 'version_conflict', currentRevision: row.revision })
    }
    const content = { ...row.content_json, title }
    const result = await pool.query(`
      UPDATE presentations SET title = $1, content_json = $2, revision = revision + 1, updated_at = NOW()
      WHERE id = $3 AND user_id = $4 AND revision = $5
      RETURNING revision, updated_at
    `, [title, content, documentId, user.id, body.revision])
    if (!result.rowCount) return sendJson(res, 409, { error: 'version_conflict' })
    return sendJson(res, 200, { document: {
      id: documentId, title, revision: result.rows[0].revision, updatedAt: result.rows[0].updated_at,
    } })
  }

  if (method === 'POST' && match[2] === 'duplicate') {
    const current = await pool.query(`
      SELECT title, content_json, slide_count FROM presentations
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    `, [documentId, user.id])
    const row = current.rows[0]
    if (!row) return sendJson(res, 404, { error: 'not_found' })
    const id = randomUUID()
    const title = normalizeTitle(`${row.title} - 副本`)
    const content = { ...row.content_json, title }
    const result = await pool.query(`
      INSERT INTO presentations
        (id, user_id, title, content_json, slide_count, revision, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
      RETURNING created_at, updated_at
    `, [id, user.id, title, content, row.slide_count])
    return sendJson(res, 201, { document: {
      id, title, content, slideCount: row.slide_count, revision: 1,
      createdAt: result.rows[0].created_at, updatedAt: result.rows[0].updated_at,
    } })
  }

  if (method === 'DELETE' && !match[2]) {
    const result = await pool.query(`
      UPDATE presentations SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    `, [documentId, user.id])
    if (!result.rowCount) return sendJson(res, 404, { error: 'not_found' })
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
  console.log(`[pptist-cloud] listening on http://${host}:${port} with PostgreSQL`)
})

const shutdown = signal => {
  console.log(`[pptist-cloud] received ${signal}, shutting down`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
