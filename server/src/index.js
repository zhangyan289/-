import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import morgan from 'morgan'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

import { openDb, initSchema, todayISO } from './db/database.js'
import { seedPresetUsers, seedSampleDataIfEmpty } from './db/seed.js'
import { authRequired } from './middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serverRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(serverRoot, '..')

dotenv.config({ path: path.join(serverRoot, '.env') })

const PORT = Number(process.env.PORT || 3000)
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

function isPlaceholderSecret(value) {
  const v = String(value || '').trim()
  if (!v) return true
  return v === 'please_change_me' || v === 'dev_secret_change_me'
}

function requireProdSecrets() {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  if (!isProd) return

  const problems = []

  if (isPlaceholderSecret(process.env.JWT_SECRET)) {
    problems.push('JWT_SECRET 未设置或仍为占位值')
  }

  if (isPlaceholderSecret(process.env.PRESET_USER_A_PASSWORD)) {
    problems.push('PRESET_USER_A_PASSWORD 未设置或仍为占位值')
  }

  if (isPlaceholderSecret(process.env.PRESET_USER_B_PASSWORD)) {
    problems.push('PRESET_USER_B_PASSWORD 未设置或仍为占位值')
  }

  if (problems.length) {
    console.error('[FATAL] 生产环境配置不安全：')
    for (const p of problems) console.error(`- ${p}`)
    console.error('请在 server/.env 中配置强随机 JWT_SECRET 与两位用户密码后再启动。')
    process.exit(1)
  }
}

requireProdSecrets()

function getPresetConfig() {
  const userA = {
    legacy: 'userA',
    newName: (process.env.PRESET_USER_A_NAME || '小鸡毛').trim(),
    newPass: String(process.env.PRESET_USER_A_PASSWORD || 'please_change_me'),
    legacyPass: 'userA'
  }
  const userB = {
    legacy: 'userB',
    newName: (process.env.PRESET_USER_B_NAME || '小白').trim(),
    newPass: String(process.env.PRESET_USER_B_PASSWORD || 'please_change_me'),
    legacyPass: 'userB'
  }

  return { userA, userB }
}

const rawDbPath = process.env.DB_PATH || './data/app.sqlite'
const DB_PATH = path.isAbsolute(rawDbPath) ? rawDbPath : path.join(serverRoot, rawDbPath)

const db = openDb({ dbPath: DB_PATH })
initSchema(db)
seedPresetUsers(db)
seedSampleDataIfEmpty(db)

const app = express()
app.use(morgan('dev'))
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '缺少 username/password' })

  const rawName = String(username).trim()
  const rawPass = String(password)

  // 兼容旧账号，并支持“新密码首次登录自动迁移”
  const { userA, userB } = getPresetConfig()
  const presetMap = {
    [userA.newName]: userA,
    userA: userA,
    [userB.newName]: userB,
    userB: userB
  }
  const preset = presetMap[rawName] || null

  const readUser = (name) => db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(name)

  // 优先新用户名，其次旧用户名
  let row = readUser(rawName)
  if (!row && preset?.legacy && preset.legacy !== rawName) {
    row = readUser(preset.legacy)
  }
  if (!row) return res.status(401).json({ error: '用户名或密码错误' })

  // 先按 DB 里的 hash 校验
  let ok = false
  try {
    ok = bcrypt.compareSync(rawPass, row.password_hash)
  } catch {
    ok = false
  }

  // 若是预设用户：允许用“新密码”在旧账号上首次登录，并自动迁移
  if (!ok && preset) {
    const isLegacyRow = row.username === preset.legacy
    const isNewRow = row.username === preset.newName

    // 旧账号：输入新密码 -> 迁移用户名+密码
    if (isLegacyRow && rawPass === preset.newPass) {
      const hash = bcrypt.hashSync(preset.newPass, 10)
      db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').run(preset.newName, hash, row.id)
      row = { ...row, username: preset.newName, password_hash: hash }
      ok = true
    }

    // 新账号：如果用户还输入旧密码，也允许并顺手升级为新密码
    if (!ok && isNewRow && rawPass === preset.legacyPass) {
      const hash = bcrypt.hashSync(preset.newPass, 10)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.id)
      row = { ...row, password_hash: hash }
      ok = true
    }
  }

  if (!ok) return res.status(401).json({ error: '用户名或密码错误' })

  const token = jwt.sign({ username: row.username }, JWT_SECRET, {
    subject: String(row.id),
    expiresIn: '7d'
  })

  return res.json({ token })
})

const requireAuth = authRequired({ jwtSecret: JWT_SECRET })

app.get('/api/me', requireAuth, (req, res) => {
  return res.json({ user: { id: req.user.id, username: req.user.username } })
})

function readAllUsers() {
  return db.prepare('SELECT id, username FROM users ORDER BY username ASC').all()
}

function readTodosForUser(userId) {
  return db
    .prepare('SELECT id, user_id as userId, text, done FROM todos WHERE user_id = ? ORDER BY id DESC')
    .all(userId)
    .map((t) => ({ ...t, done: Boolean(t.done) }))
}

function readTodayStudySeconds(userId, date) {
  const row = db.prepare('SELECT seconds FROM study_daily WHERE user_id = ? AND date = ?').get(userId, date)
  return row ? Number(row.seconds || 0) : 0
}

function parseDays(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(365, Math.max(1, Math.floor(n)))
}

function parseISODate(value) {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function readSharedValue(key) {
  const row = db.prepare('SELECT value, updated_at as updatedAt FROM shared_kv WHERE key = ?').get(key)
  if (!row) return null
  return { value: String(row.value || ''), updatedAt: row.updatedAt }
}

function writeSharedValue(key, value) {
  db.prepare(
    `INSERT INTO shared_kv (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key)
     DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value)
}

function sanitizeCountdownPayload(body) {
  const kaoyanDate = parseISODate(body?.kaoyanDate) || '2026-12-20'
  const raw = Array.isArray(body?.countdowns) ? body.countdowns : []
  const countdowns = []
  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue
    const id = String(item.id || '').slice(0, 64)
    const name = String(item.name || '').trim().slice(0, 40)
    const date = parseISODate(item.date) || ''
    if (!id || !name || !date) continue
    countdowns.push({ id, name, date })
  }
  return { kaoyanDate, countdowns }
}

function sanitizeMessageText(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) return ''
  return text.slice(0, 280)
}

const MAX_SHARED_MESSAGES = 300
const MAX_MESSAGE_AGE_DAYS = 180

function isRecentISO(iso, maxDays) {
  try {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return false
    const ageMs = Date.now() - t
    return ageMs <= maxDays * 24 * 3600 * 1000
  } catch {
    return false
  }
}

function safeParseJson(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function readSharedMessages() {
  const row = readSharedValue('messages')
  if (!row) return { messages: [], updatedAt: null }
  const parsed = safeParseJson(row.value || '', null)
  const raw = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.messages) ? parsed.messages : []
  const messages = []
  for (const item of raw.slice(0, MAX_SHARED_MESSAGES)) {
    if (!item || typeof item !== 'object') continue
    const id = String(item.id || '').slice(0, 64)
    const author = String(item.author || '').slice(0, 40)
    const text = sanitizeMessageText(item.text)
    const createdAt = String(item.createdAt || '')
    if (!id || !author || !text || !createdAt) continue
    if (!isRecentISO(createdAt, MAX_MESSAGE_AGE_DAYS)) continue
    messages.push({ id, author, text, createdAt })
  }
  return { messages, updatedAt: row.updatedAt || null }
}

function appendSharedMessage({ author, text }) {
  const { messages } = readSharedMessages()
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  const createdAt = new Date().toISOString()
  const entry = { id, author, text, createdAt }
  const next = [entry, ...messages].slice(0, MAX_SHARED_MESSAGES)
  writeSharedValue('messages', JSON.stringify({ messages: next }))
  const updatedAt = db.prepare('SELECT updated_at as updatedAt FROM shared_kv WHERE key = ?').get('messages')
    ?.updatedAt
  return { message: entry, updatedAt: updatedAt || null }
}

function addDaysISO(dateISO, deltaDays) {
  const [y, m, d] = dateISO.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function listRecentDates(endDateISO, days) {
  const dates = []
  for (let i = days - 1; i >= 0; i--) {
    dates.push(addDaysISO(endDateISO, -i))
  }
  return dates
}

function minISO(a, b) {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function getEarliestDateISO() {
  const minStudy = db.prepare('SELECT MIN(date) AS d FROM study_daily').get()?.d || null
  const minUser = db.prepare("SELECT MIN(date(created_at)) AS d FROM users").get()?.d || null
  // 兜底：如果都没有（理论上不会），用 today
  return minISO(minStudy, minUser) || todayISO()
}

app.get('/api/overview/today', requireAuth, (req, res) => {
  const date = todayISO()
  const all = readAllUsers()
  const users = all.map((u) => ({
    username: u.username,
    todos: readTodosForUser(u.id),
    todayStudySeconds: readTodayStudySeconds(u.id, date)
  }))

  return res.json({ date, users })
})

// 共享倒计时：两人共同编辑
app.get('/api/shared/countdowns', requireAuth, (req, res) => {
  const row = readSharedValue('countdowns')
  if (!row) {
    return res.json({ kaoyanDate: '2026-12-20', countdowns: [], updatedAt: null })
  }
  try {
    const parsed = JSON.parse(row.value || '{}')
    const payload = sanitizeCountdownPayload(parsed)
    return res.json({ ...payload, updatedAt: row.updatedAt || null })
  } catch (_) {
    return res.json({ kaoyanDate: '2026-12-20', countdowns: [], updatedAt: row.updatedAt || null })
  }
})

app.put('/api/shared/countdowns', requireAuth, (req, res) => {
  const payload = sanitizeCountdownPayload(req.body || {})
  writeSharedValue('countdowns', JSON.stringify(payload))
  const updatedAt = db.prepare('SELECT updated_at as updatedAt FROM shared_kv WHERE key = ?').get('countdowns')
    ?.updatedAt
  return res.json({ ok: true, ...payload, updatedAt: updatedAt || null })
})

// 共享留言箱：非实时留言（两人互相可见/可留言）
app.get('/api/shared/messages', requireAuth, (req, res) => {
  return res.json(readSharedMessages())
})

app.post('/api/shared/messages', requireAuth, (req, res) => {
  const text = sanitizeMessageText(req.body?.text)
  if (!text) return res.status(400).json({ error: '留言不能为空' })
  const author = String(req.user?.username || '').slice(0, 40)
  const out = appendSharedMessage({ author, text })
  return res.json({ ok: true, ...out })
})

// 最近 N 天学习历史（两人互相可见）
app.get('/api/study/history', requireAuth, (req, res) => {
  const earliestDate = getEarliestDateISO()

  const qStart = parseISODate(req.query?.start)
  const qEnd = parseISODate(req.query?.end)
  const qDays = req.query?.days

  // 模式 1：start/end 明确范围（用于精确区间查询），限制最多 400 天，避免一次性返回过大
  if (qStart && qEnd) {
    const startDate = qStart
    const endDate = qEnd
    if (startDate > endDate) return res.status(400).json({ error: 'start 不能晚于 end' })

    // 计算天数（包含首尾）
    const startDt = new Date(startDate)
    const endDt = new Date(endDate)
    const diffDays = Math.floor((endDt - startDt) / (24 * 3600 * 1000)) + 1
    if (!Number.isFinite(diffDays) || diffDays <= 0) return res.status(400).json({ error: '日期范围无效' })
    if (diffDays > 400) {
      return res.status(400).json({
        error: '日期范围过大，请用 days+end 分页加载',
        hint: { example: '/api/study/history?days=30&end=2026-01-16' }
      })
    }

    const dates = []
    for (let i = 0; i < diffDays; i++) dates.push(addDaysISO(startDate, i))
    return sendHistory({ startDate, endDate, dates, earliestDate }, req, res)
  }

  // 模式 2：分页向前：days + end（end 默认 today）
  const days = parseDays(qDays, 14)
  const endDate = qEnd || todayISO()
  const dates = listRecentDates(endDate, days)
  const startDate = dates[0]

  return sendHistory({ startDate, endDate, dates, earliestDate }, req, res)


function sendHistory(meta, req, res) {
  const { startDate, endDate, dates, earliestDate } = meta
  const allUsers = readAllUsers()
  const userIds = allUsers.map((u) => u.id)
  if (userIds.length === 0) return res.json({ ...meta, users: [] })

  const placeholders = userIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT u.id as userId, u.username as username, s.date as date, s.seconds as seconds
       FROM users u
       LEFT JOIN study_daily s
         ON s.user_id = u.id AND s.date BETWEEN ? AND ?
       WHERE u.id IN (${placeholders})
       ORDER BY u.username ASC, s.date ASC`
    )
    .all(startDate, endDate, ...userIds)

  const byUser = new Map(allUsers.map((u) => [u.id, { username: u.username, byDate: new Map() }]))
  for (const r of rows) {
    if (!r?.date) continue
    const u = byUser.get(r.userId)
    if (!u) continue
    u.byDate.set(r.date, Number(r.seconds || 0))
  }

  const users = allUsers.map((u) => {
    const entry = byUser.get(u.id)
    const history = dates.map((date) => ({
      date,
      seconds: entry?.byDate.get(date) ?? 0
    }))
    const todaySeconds = entry?.byDate.get(endDate) ?? 0
    return {
      username: u.username,
      todayStudySeconds: todaySeconds,
      history
    }
  })

  return res.json({ startDate, endDate, dates, earliestDate, users })
}
  const allUsers = readAllUsers()
  const userIds = allUsers.map((u) => u.id)
  if (userIds.length === 0) return res.json({ startDate, endDate, dates, users: [] })

  const placeholders = userIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT u.id as userId, u.username as username, s.date as date, s.seconds as seconds
       FROM users u
       LEFT JOIN study_daily s
         ON s.user_id = u.id AND s.date BETWEEN ? AND ?
       WHERE u.id IN (${placeholders})
       ORDER BY u.username ASC, s.date ASC`
    )
    .all(startDate, endDate, ...userIds)

  const byUser = new Map(allUsers.map((u) => [u.id, { username: u.username, byDate: new Map() }]))
  for (const r of rows) {
    if (!r?.date) continue
    const u = byUser.get(r.userId)
    if (!u) continue
    u.byDate.set(r.date, Number(r.seconds || 0))
  }

  const users = allUsers.map((u) => {
    const entry = byUser.get(u.id)
    const history = dates.map((date) => ({
      date,
      seconds: entry?.byDate.get(date) ?? 0
    }))
    const todaySeconds = entry?.byDate.get(endDate) ?? 0
    return {
      username: u.username,
      todayStudySeconds: todaySeconds,
      history
    }
  })

  return res.json({ startDate, endDate, dates, users })
})

app.post('/api/todos', requireAuth, (req, res) => {
  const text = String(req.body?.text || '').trim()
  if (!text) return res.status(400).json({ error: 'Todo 不能为空' })
  if (text.length > 120) return res.status(400).json({ error: 'Todo 过长' })

  const info = db.prepare('INSERT INTO todos (user_id, text, done) VALUES (?, ?, 0)').run(req.user.id, text)
  return res.json({ id: info.lastInsertRowid })
})

app.patch('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效 id' })

  const row = db.prepare('SELECT id, user_id FROM todos WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '未找到' })
  if (Number(row.user_id) !== Number(req.user.id)) return res.status(403).json({ error: '只能编辑自己的 Todo' })

  const patchText = req.body?.text
  const patchDone = req.body?.done

  if (patchText !== undefined) {
    const text = String(patchText || '').trim()
    if (!text) return res.status(400).json({ error: 'Todo 不能为空' })
    if (text.length > 120) return res.status(400).json({ error: 'Todo 过长' })
    db.prepare('UPDATE todos SET text = ? WHERE id = ?').run(text, id)
  }

  if (patchDone !== undefined) {
    db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(patchDone ? 1 : 0, id)
  }

  return res.json({ ok: true })
})

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效 id' })

  const row = db.prepare('SELECT id, user_id FROM todos WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '未找到' })
  if (Number(row.user_id) !== Number(req.user.id)) return res.status(403).json({ error: '只能删除自己的 Todo' })

  db.prepare('DELETE FROM todos WHERE id = ?').run(id)
  return res.json({ ok: true })
})

app.post('/api/study/add', requireAuth, (req, res) => {
  const seconds = Number(req.body?.seconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return res.status(400).json({ error: 'seconds 需为正数' })
  if (seconds > 12 * 3600) return res.status(400).json({ error: 'seconds 过大' })

  const date = todayISO()

  db.prepare(
    `INSERT INTO study_daily (user_id, date, seconds, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, date)
     DO UPDATE SET seconds = seconds + excluded.seconds, updated_at = datetime('now')`
  ).run(req.user.id, date, Math.floor(seconds))

  const total = readTodayStudySeconds(req.user.id, date)
  return res.json({ ok: true, date, todayStudySeconds: total })
})

// 同域托管前端构建产物：server 负责提供 / 和静态资源
const clientDist = path.join(workspaceRoot, 'client', 'dist')
const indexHtml = path.join(clientDist, 'index.html')

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))

  // SPA fallback：非 /api 的路由都返回 index.html
  app.get(/^(?!\/api).*/, (req, res) => {
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml)
    return res.status(404).send('client dist missing')
  })
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`)
})
