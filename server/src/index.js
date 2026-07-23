import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import morgan from 'morgan'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

import { openDb, initSchema, todayISO, seedPetStatesIfEmpty, migratePetStatesV2, addUserPetInventoryColumns, migrateEnglishQuizTables } from './db/database.js'
import { seedPresetUsers, seedSampleDataIfEmpty } from './db/seed.js'
import { authRequired } from './middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serverRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(serverRoot, '..')

dotenv.config({ path: path.join(serverRoot, '.env') })

const PORT = Number(process.env.PORT || 3000)
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'
const KIMI_API_KEY = process.env.KIMI_API_KEY || ''
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1'

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
migratePetStatesV2(db)
addUserPetInventoryColumns(db)
migrateEnglishQuizTables(db)
seedPetStatesIfEmpty(db)
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

// 在线状态（presence）：记录每个用户最近一次请求的时间戳。
// 轻量实现：内存 Map（重启会清空），足够用于“对方在线/离线”提示。
const PRESENCE_ONLINE_MS = 60 * 1000
const presenceLastSeenMs = new Map()
function touchPresence(username) {
  const name = String(username || '').trim()
  if (!name) return
  presenceLastSeenMs.set(name, Date.now())
}

const requireAuth = authRequired({
  jwtSecret: JWT_SECRET,
  onAuthenticated: (req) => touchPresence(req.user?.username)
})

app.get('/api/me', requireAuth, (req, res) => {
  return res.json({ user: { id: req.user.id, username: req.user.username } })
})

app.get('/api/presence', requireAuth, (req, res) => {
  const nowMs = Date.now()
  const all = readAllUsers()
  const users = all.map((u) => {
    const lastSeenMs = presenceLastSeenMs.get(u.username) || null
    const online = lastSeenMs ? nowMs - lastSeenMs <= PRESENCE_ONLINE_MS : false
    return { username: u.username, lastSeenMs, online }
  })
  return res.json({ serverNowMs: nowMs, onlineThresholdMs: PRESENCE_ONLINE_MS, users })
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
     VALUES (?, ?, ?)
     ON CONFLICT(key)
     DO UPDATE SET value = excluded.value, updated_at = ?`
  ).run(key, value, nowISO(), nowISO())
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

const FOOD_CONFIG = {
  white: {
    pingguo: { name: '苹果', cost: 3, happiness: 15, eatingState: 'eating_pingguo', eatingMinutes: 30 },
    xiaodangao: { name: '小蛋糕', cost: 6, happiness: 30, eatingState: 'eating_xiaodangao', eatingMinutes: 30 },
    bingqilin: { name: '冰淇淋', cost: 3, happiness: 15, eatingState: 'eating_bingqilin', eatingMinutes: 30 },
    malawangzi: { name: '麻辣王子', cost: 1, happiness: 5, eatingState: 'eating_malawangzi', eatingMinutes: 30 },
    mixian: { name: '米线', cost: 5, happiness: 25, eatingState: 'eating_mixian', eatingMinutes: 30 },
    xican: { name: '西餐', cost: 6, happiness: 30, eatingState: 'eating_xican', eatingMinutes: 30 },
    zhenzhunaicha: { name: '珍珠奶茶', cost: 4, happiness: 20, eatingState: 'eating_zhenzhunaicha', eatingMinutes: 30 }
  },
  golden: {
    pingguo: { name: '苹果', cost: 3, happiness: 15, eatingState: 'eating_pingguo', eatingMinutes: 30 },
    xiaodangao: { name: '小蛋糕', cost: 6, happiness: 30, eatingState: 'eating_xiaodangao', eatingMinutes: 30 },
    bingqilin: { name: '冰淇淋', cost: 3, happiness: 15, eatingState: 'eating_bingqilin', eatingMinutes: 30 },
    linyushui: { name: '淋浴水', cost: 1, happiness: 5, eatingState: 'eating_linyushui', eatingMinutes: 30 },
    kafei: { name: '咖啡', cost: 4, happiness: 20, eatingState: 'eating_kafei', eatingMinutes: 30 },
    kfcgouliang: { name: 'KFC狗粮', cost: 3, happiness: 15, eatingState: 'eating_kfcgouliang', eatingMinutes: 30 },
    gougebao: { name: '狗狗堡', cost: 6, happiness: 30, eatingState: 'eating_gougebao', eatingMinutes: 30 }
  }
}
const EATING_GIF_MAP = {
  eating_pingguo: 'food_pingguo.gif',
  eating_xiaodangao: 'food_xiaodangao.gif',
  eating_bingqilin: 'food_bingqilin.gif',
  eating_linyushui: 'food_linyushui.gif',
  eating_kafei: 'food_kafei.gif',
  eating_zhenzhunaicha: 'food_zhenzhunaicha.gif',
  eating_mixian: 'food_mixian.gif',
  eating_xican: 'food_xican.gif',
  eating_kfcgouliang: 'food_kfcgouliang.gif',
  eating_malawangzi: 'food_malawangzi.gif',
  eating_gougebao: 'food_gougebao.gif'
}
const POINTS_PER_TODO = 5
const POINTS_PER_STUDY_MINUTE = 1 // 每学 1 分钟涨 1 积分
const PET_HAPPINESS_DECAY_PER_HOUR = 5 // 每小时减 5 愉悦度
const PET_RUNAWAY_THRESHOLD_HOURS = 3
const PET_FEED_COOLDOWN_MINUTES = 0 // 不加喂食冷却，支持连续喂食
const PET_EATING_DURATION_MINUTES = 30
const PET_ROTATION_MINUTES = 60 // 当前愉悦度 GIF 每小时更换一次
const PET_MAX_STAT = 100

function clampStat(n) {
  return Math.max(0, Math.min(PET_MAX_STAT, Math.round(n || 0)))
}

function getPetLevel(happiness) {
  return Math.min(5, Math.max(1, Math.floor(Number(happiness || 0) / 20) + 1))
}

const PET_SUB_STATES = {
  golden: { 1: [1, 2], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3], 5: [1, 2, 3, 4, 5] },
  white: { 1: [2, 3, 4], 2: [1, 2], 3: [1, 2], 4: [1, 2, 3], 5: [1, 2, 3, 4, 5] }
}

function getPetSubStates(level, petKey) {
  return PET_SUB_STATES[petKey]?.[level] || [1]
}

function parseCurrentState(value) {
  if (!value) return null
  const m = String(value).match(/^([1-5])\.(\d+)$/)
  if (!m) return null
  return { level: Number(m[1]), sub: Number(m[2]) }
}

function pickRandomSub(level, petKey, excludeSub) {
  const subs = getPetSubStates(level, petKey)
  if (subs.length <= 1) return subs[0]
  const candidates = excludeSub !== undefined && excludeSub !== null
    ? subs.filter((s) => s !== excludeSub)
    : subs
  if (candidates.length === 0) return subs[0]
  const idx = Math.floor(Math.random() * candidates.length)
  return candidates[idx]
}

function pickSyncedSub(level, petKey, otherSub) {
  const subs = getPetSubStates(level, petKey)
  if (subs.includes(otherSub)) return otherSub
  // 没有精确对应时，取最接近的编号
  return subs.reduce((best, s) => {
    if (best === null) return s
    return Math.abs(s - otherSub) < Math.abs(best - otherSub) ? s : best
  }, null) || subs[0]
}

function updatePetCurrentState(petKey, currentState) {
  db.prepare(
    `UPDATE pet_states
     SET current_state = ?, current_state_updated_at = ?
     WHERE pet_key = ?`
  ).run(currentState, nowISO(), petKey)
}

function syncPetCurrentState(petKey) {
  const state = decayAndGetState(petKey)
  if (!state) return null

  // 进食或离家出走时不切换正常状态
  if (state.runaway || (state.eating_state && isAfterISO(state.eating_until, nowISO()))) {
    return state.current_state || `${getPetLevel(state.happiness)}.1`
  }

  const level = getPetLevel(state.happiness)
  const current = parseCurrentState(state.current_state)
  const updatedAt = state.current_state_updated_at
  const now = Date.now()
  const last = updatedAt ? new Date(updatedAt).getTime() : 0
  const expired = !last || now - last >= PET_ROTATION_MINUTES * 60 * 1000
  const levelChanged = !current || current.level !== level

  if (!expired && !levelChanged) return state.current_state

  let sub = 1
  const otherKey = petKey === 'golden' ? 'white' : 'golden'
  const otherState = readPetState(otherKey)
  const otherCurrent = parseCurrentState(otherState?.current_state)

  if (levelChanged && otherCurrent && otherCurrent.level === level) {
    // 另一只宠物同等级，同步其具体子状态
    sub = pickSyncedSub(level, petKey, otherCurrent.sub)
  } else {
    // 同等级随机轮播，尽量不重复
    sub = pickRandomSub(level, petKey, current?.level === level ? current.sub : null)
  }

  const newState = `${level}.${sub}`
  updatePetCurrentState(petKey, newState)
  state.current_state = newState
  state.current_state_updated_at = nowISO()
  return newState
}

function nowISO() {
  // 使用与 SQLite datetime('now') 一致的本地时间格式，避免 ISO 格式与本地格式混用导致时区差计算错误
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function hoursBetweenISO(a, b) {
  if (!a || !b) return 0
  const t1 = new Date(a).getTime()
  const t2 = new Date(b).getTime()
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0
  return Math.max(0, (t2 - t1) / (3600 * 1000))
}

function addMinutesISO(iso, minutes) {
  const dt = new Date(iso || nowISO())
  dt.setMinutes(dt.getMinutes() + minutes)
  return dt.toISOString()
}

function isAfterISO(iso, reference) {
  if (!iso) return false
  return new Date(iso).getTime() > new Date(reference || nowISO()).getTime()
}

function readPetState(petKey) {
  return db.prepare('SELECT * FROM pet_states WHERE pet_key = ?').get(petKey)
}

function readPetStates() {
  return db.prepare('SELECT * FROM pet_states ORDER BY pet_key ASC').all()
}

function applyPetDecay(state) {
  if (!state) return state
  const updatedAt = state.updated_at || nowISO()
  const hours = hoursBetweenISO(updatedAt, nowISO())
  if (hours <= 0) return state

  // 愉悦度自然衰减：24h 从 100 降到 0
  let happiness = clampStat((state.happiness || 0) - hours * PET_HAPPINESS_DECAY_PER_HOUR)

  // 进食状态到期自动结束
  let eatingState = state.eating_state
  let eatingUntil = state.eating_until
  if (eatingUntil && !isAfterISO(eatingUntil, nowISO())) {
    eatingState = null
    eatingUntil = null
  }

  // 离家出走判定：愉悦度 0 持续 6h
  let runaway = state.runaway || 0
  let runawaySince = state.runaway_since
  if (happiness <= 0) {
    if (!runawaySince) runawaySince = nowISO()
    const unhappyHours = hoursBetweenISO(runawaySince, nowISO())
    if (unhappyHours >= PET_RUNAWAY_THRESHOLD_HOURS) {
      runaway = 1
    }
  } else {
    runawaySince = null
    runaway = 0
  }

  // 喂食冷却到期清空
  let cooldownUntil = state.feed_cooldown_until
  if (cooldownUntil && !isAfterISO(cooldownUntil, nowISO())) {
    cooldownUntil = null
  }

  state.happiness = happiness
  state.runaway = runaway
  state.runaway_since = runawaySince
  state.eating_state = eatingState
  state.eating_until = eatingUntil
  state.feed_cooldown_until = cooldownUntil
  return state
}

function persistPetDecay(state) {
  if (!state) return
  db.prepare(
    `UPDATE pet_states
     SET happiness = ?, runaway = ?, runaway_since = ?, eating_state = ?, eating_until = ?, feed_cooldown_until = ?, updated_at = ?
     WHERE pet_key = ?`
  ).run(
    state.happiness,
    state.runaway ? 1 : 0,
    state.runaway_since || null,
    state.eating_state || null,
    state.eating_until || null,
    state.feed_cooldown_until || null,
    nowISO(),
    state.pet_key
  )
}

function decayAndGetState(petKey) {
  const state = readPetState(petKey)
  if (!state) return null
  applyPetDecay(state)
  persistPetDecay(state)
  return state
}

function readUserInventory(userId) {
  let row = db.prepare('SELECT points, runaway_marks FROM user_pet_inventory WHERE user_id = ?').get(userId)
  if (!row) {
    db.prepare('INSERT INTO user_pet_inventory (user_id, points, runaway_marks) VALUES (?, 0, 0)').run(userId)
    row = { points: 0, runaway_marks: 0 }
  }
  return {
    points: Number(row.points || 0),
    runaway_marks: Number(row.runaway_marks || 0)
  }
}

function updateUserInventory(userId, patch) {
  const inv = readUserInventory(userId)
  const next = {
    points: Number(patch.points !== undefined ? patch.points : inv.points),
    runaway_marks: Number(patch.runaway_marks !== undefined ? patch.runaway_marks : inv.runaway_marks)
  }
  db.prepare(
    `INSERT INTO user_pet_inventory (user_id, points, runaway_marks) VALUES (?, ?, ?)
     ON CONFLICT(user_id)
     DO UPDATE SET points = excluded.points, runaway_marks = excluded.runaway_marks, updated_at = ?`
  ).run(userId, next.points, next.runaway_marks, nowISO())
  return next
}

function addUserPoints(userId, amount) {
  const inv = readUserInventory(userId)
  return updateUserInventory(userId, { points: Math.max(0, inv.points + Number(amount || 0)) })
}

function updateUserPoints(userId, amount) {
  return addUserPoints(userId, amount)
}

function addRunawayMark(userId) {
  const inv = readUserInventory(userId)
  return updateUserInventory(userId, { runaway_marks: inv.runaway_marks + 1 })
}

function getPetOwnerUserId(petKey) {
  const allUsers = readAllUsers()
  if (petKey === 'golden') {
    return allUsers.find((u) => u.username === '小鸡毛' || u.username === 'userA')?.id
  }
  if (petKey === 'white') {
    return allUsers.find((u) => u.username === '小白' || u.username === 'userB')?.id
  }
  return null
}

// 当天投喂记录（内存级，跨天不持久化）
const dailyFeedLog = new Map()

function cleanupStaleFeedLog() {
  const today = todayISO()
  const firstKey = dailyFeedLog.keys().next().value
  if (firstKey && firstKey !== today) {
    dailyFeedLog.clear()
  }
}

function recordFeed({ petKey, foodName, username }) {
  cleanupStaleFeedLog()
  const today = todayISO()
  if (!dailyFeedLog.has(today)) {
    dailyFeedLog.set(today, [])
  }
  const entry = { petKey, foodName, username, fedAt: nowISO() }
  dailyFeedLog.get(today).push(entry)
  return entry
}

function getTodayFeedLog() {
  cleanupStaleFeedLog()
  const today = todayISO()
  return dailyFeedLog.get(today) || []
}

const QUIZ_COOLDOWN_MINUTES = 120
const QUIZ_REWARD_HAPPINESS = 10
const QUIZ_PENALTY_HAPPINESS = -10
const quizCache = new Map()
const quizGenerationLocks = {}

const QUIZ_PET_PROFILES = {
  golden: {
    name: '小金毛',
    subjects: '英语、408（数据结构、计算机组成原理、计算机网络、操作系统）',
    major: '计算机科学与技术'
  },
  white: {
    name: '小白',
    subjects: '英语、自动控制原理、现代控制理论',
    major: '电子信息（0854）'
  }
}

function buildQuizPrompt(petKey) {
  const profile = QUIZ_PET_PROFILES[petKey]
  return `你是考研出题助手。请为"${profile.name}"（${profile.major}，考 ${profile.subjects}）出一道选择题。
要求：
1. 题干明确，4 个选项分别标为 A、B、C、D。
2. 难度适中，适合考研复习。
3. 必须只返回 JSON，不要任何解释、问候、markdown、代码块。JSON 格式如下：
{"question":"题目内容","options":{"A":"选项A","B":"选项B","C":"选项C","D":"选项D"},"answer":"A","explanation":"简短解析"}`
}

function isQuizAvailable(entry) {
  if (!entry) return true
  if (entry.answeredAt) {
    const nextAt = addMinutesISO(entry.answeredAt, QUIZ_COOLDOWN_MINUTES)
    return !isAfterISO(nextAt, nowISO())
  }
  return true
}

function getQuizQuestionAgeMinutes(entry) {
  if (!entry?.generatedAt) return 9999
  return (Date.now() - new Date(entry.generatedAt).getTime()) / (60 * 1000)
}

function parseQuizJson(text) {
  if (!text) return null
  const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed.question || !parsed.options || !parsed.answer || !parsed.explanation) return null
    const answer = String(parsed.answer).toUpperCase().trim()
    if (!['A', 'B', 'C', 'D'].includes(answer)) return null
    const options = {}
    for (const key of ['A', 'B', 'C', 'D']) {
      options[key] = String(parsed.options[key] || '')
    }
    if (Object.values(options).some((v) => !v)) return null
    return { question: String(parsed.question), options, answer, explanation: String(parsed.explanation) }
  } catch {
    return null
  }
}

async function generateQuiz(petKey) {
  const existing = quizCache.get(petKey)
  // 已回答且仍在冷却期：直接返回冷却状态，不调用 API
  if (existing && !isQuizAvailable(existing)) {
    return { ...existing, status: 'cooldown', nextAt: addMinutesISO(existing.answeredAt, QUIZ_COOLDOWN_MINUTES) }
  }
  // 未回答的题目：一直保留，直到被回答
  if (existing && !existing.answeredAt) {
    return { ...existing, status: 'pending' }
  }

  // 并发控制：同一只宠物同时只能发起一次大模型请求
  if (quizGenerationLocks[petKey]) {
    await quizGenerationLocks[petKey]
    const newExisting = quizCache.get(petKey)
    if (newExisting) {
      return { ...newExisting, status: newExisting.answeredAt ? 'cooldown' : 'pending' }
    }
  }

  let releaseLock = () => {}
  quizGenerationLocks[petKey] = new Promise((resolve) => { releaseLock = resolve })

  try {
    if (!KIMI_API_KEY) {
      // 没有 key 时使用固定模拟题，方便前端联调
      const mockQuestion = petKey === 'golden'
        ? { question: '以下哪种数据结构最适合实现 LRU 缓存？', options: { A: '数组', B: '哈希表 + 双向链表', C: '栈', D: '队列' }, answer: 'B', explanation: 'LRU 需要 O(1) 查找和 O(1) 删除，哈希表 + 双向链表最合适。' }
        : { question: '自动控制系统的稳定性判据中，奈奎斯特判据主要用于？', options: { A: '时域分析', B: '频域分析', C: '根轨迹分析', D: '状态空间分析' }, answer: 'B', explanation: '奈奎斯特判据基于开环频率特性判断闭环稳定性。' }
      const entry = { petKey, ...mockQuestion, generatedAt: nowISO(), answeredAt: null }
      quizCache.set(petKey, entry)
      return { ...entry, status: 'pending' }
    }

    const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KIMI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: '你是一个严格按 JSON 格式返回的考研出题助手。' },
          { role: 'user', content: buildQuizPrompt(petKey) }
        ],
        temperature: 0.5
      })
    })
    if (!response.ok) {
      const err = await response.text().catch(() => '未知错误')
      throw new Error(`Kimi API 错误: ${err}`)
    }
    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content || ''
    const parsed = parseQuizJson(raw)
    if (!parsed) throw new Error('题目格式解析失败')
    const entry = { petKey, ...parsed, generatedAt: nowISO(), answeredAt: null }
    quizCache.set(petKey, entry)
    return { ...entry, status: 'pending' }
  } catch (e) {
    console.error('[quiz] generate failed:', e?.message || String(e))
    return { status: 'unavailable', reason: '大模型服务暂不可用' }
  } finally {
    releaseLock()
    delete quizGenerationLocks[petKey]
  }
}

function recordQuizAnswer({ petKey, selectedOption, username }) {
  const entry = quizCache.get(petKey)
  if (!entry) throw new Error('当前没有题目')
  if (entry.answeredAt) throw new Error('本题已回答')
  const correct = String(selectedOption).toUpperCase().trim() === String(entry.answer).toUpperCase().trim()

  const state = decayAndGetState(petKey)
  if (!state) throw new Error('宠物不存在')
  const happiness = clampStat((state.happiness || 0) + (correct ? QUIZ_REWARD_HAPPINESS : QUIZ_PENALTY_HAPPINESS))

  db.prepare(
    `UPDATE pet_states
     SET happiness = ?, updated_at = ?
     WHERE pet_key = ?`
  ).run(happiness, nowISO(), petKey)

  entry.answeredAt = nowISO()
  entry.selectedOption = selectedOption
  entry.correct = correct
  entry.answeredBy = username
  quizCache.set(petKey, entry)

  return { correct, happiness, explanation: entry.explanation, answer: entry.answer }
}

function getQuizStatus(petKey) {
  const entry = quizCache.get(petKey)
  if (!entry) return { status: 'pending', hasQuestion: false }
  if (!isQuizAvailable(entry)) {
    return { status: 'cooldown', nextAt: addMinutesISO(entry.answeredAt, QUIZ_COOLDOWN_MINUTES) }
  }
  return { status: 'pending', hasQuestion: true }
}

function feedPet({ userId, username, petKey, foodKey }) {
  const food = FOOD_CONFIG[petKey]?.[foodKey]
  if (!food) throw new Error('未知食物')

  const state = decayAndGetState(petKey)
  if (!state) throw new Error('宠物不存在')
  if (state.happiness >= 100) throw new Error('宠物已经很开心了，不需要投喂')

  const inv = readUserInventory(userId)
  if (inv.points < food.cost) throw new Error('积分不足')

  // 如果是离家出走状态，先回来并加标记
  let runawayMarksAdded = 0
  let happiness = state.happiness
  let runaway = state.runaway
  let runawaySince = state.runaway_since
  if (runaway) {
    const ownerId = getPetOwnerUserId(petKey)
    if (ownerId) {
      addRunawayMark(ownerId)
      runawayMarksAdded = 1
    }
    happiness = 20
    runaway = 0
    runawaySince = null
  }

  // 加愉悦度：1 积分 = 5 愉悦度
  happiness = clampStat(happiness + food.happiness)

  // 进入进食状态
  const eatingState = food.eatingState
  const eatingUntil = addMinutesISO(nowISO(), food.eatingMinutes)

  const totalFeeds = (state.total_feeds || 0) + 1

  db.prepare(
    `UPDATE pet_states
     SET happiness = ?, runaway = ?, runaway_since = ?, eating_state = ?, eating_until = ?, feed_cooldown_until = NULL, total_feeds = ?, last_fed_by = ?, updated_at = ?
     WHERE pet_key = ?`
  ).run(
    happiness,
    runaway ? 1 : 0,
    runawaySince || null,
    eatingState,
    eatingUntil,
    totalFeeds,
    username,
    nowISO(),
    petKey
  )

  const remaining = updateUserInventory(userId, { points: inv.points - food.cost })
  const currentState = syncPetCurrentState(petKey)

  // 记录当天投喂
  const feedLog = recordFeed({ petKey, foodName: food.name, username })

  return {
    state: {
      ...state,
      happiness,
      runaway,
      runaway_since: runawaySince,
      eating_state: eatingState,
      eating_until: eatingUntil,
      feed_cooldown_until: null,
      total_feeds: totalFeeds,
      last_fed_by: username,
      current_state: currentState
    },
    remainingPoints: remaining.points,
    runawayMarksAdded,
    feedLog
  }
}

function touchPet({ userId, username, petKey }) {
  const state = decayAndGetState(petKey)
  if (!state) throw new Error('宠物不存在')
  if (state.runaway) {
    // 点击离家出走的宠物，把它唤回并加标记
    const ownerId = getPetOwnerUserId(petKey)
    let runawayMarksAdded = 0
    if (ownerId) {
      addRunawayMark(ownerId)
      runawayMarksAdded = 1
    }
    const happiness = 20
    db.prepare(
      `UPDATE pet_states
       SET happiness = ?, runaway = 0, runaway_since = NULL, updated_at = ?
       WHERE pet_key = ?`
    ).run(happiness, nowISO(), petKey)
    const currentState = syncPetCurrentState(petKey)
    return { ...state, happiness, runaway: 0, runaway_since: null, current_state: currentState, runawayMarksAdded }
  }
  // 正常点击不再 +1 愉悦度，仅同步当前状态
  const currentState = syncPetCurrentState(petKey)
  return { ...state, current_state: currentState }
}

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
  const inventories = new Map()
  for (const u of all) {
    const inv = readUserInventory(u.id)
    inventories.set(u.username, inv.runaway_marks)
  }
  const users = all.map((u) => ({
    username: u.username,
    todos: readTodosForUser(u.id),
    todayStudySeconds: readTodayStudySeconds(u.id, date),
    runawayMarks: inventories.get(u.username) || 0
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
})

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

  const row = db.prepare('SELECT id, user_id, done FROM todos WHERE id = ?').get(id)
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
    const nextDone = patchDone ? 1 : 0
    const prevDone = row.done ? 1 : 0
    if (nextDone && !prevDone) {
      db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(nextDone, id)
      addUserPoints(req.user.id, POINTS_PER_TODO)
    } else if (!nextDone && prevDone) {
      return res.status(400).json({ error: '任务已完成，无法撤销' })
    }
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
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date)
     DO UPDATE SET seconds = seconds + excluded.seconds, updated_at = ?`
  ).run(req.user.id, date, Math.floor(seconds), nowISO(), nowISO())

  // 学习时长奖励积分：每 1 分钟 1 积分
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) {
    addUserPoints(req.user.id, minutes * POINTS_PER_STUDY_MINUTE)
  }

  const total = readTodayStudySeconds(req.user.id, date)
  const inventory = readUserInventory(req.user.id)
  return res.json({ ok: true, date, todayStudySeconds: total, points: inventory.points })
})

// 桌宠系统
app.get('/api/pets/state', requireAuth, (req, res) => {
  const states = readPetStates()
  for (const s of states) applyPetDecay(s)
  for (const s of states) persistPetDecay(s)
  const currentStates = {}
  for (const s of states) currentStates[s.pet_key] = syncPetCurrentState(s.pet_key)
  const inventory = readUserInventory(req.user.id)
  return res.json({
    pets: states,
    points: inventory.points,
    runawayMarks: inventory.runaway_marks,
    foodConfig: FOOD_CONFIG,
    eatingGifMap: EATING_GIF_MAP,
    currentStates
  })
})

app.get('/api/pets/feed-log', requireAuth, (req, res) => {
  return res.json({ date: todayISO(), logs: getTodayFeedLog() })
})

app.get('/api/pets/quiz/status', requireAuth, (req, res) => {
  const petKey = String(req.query?.petKey || '').trim()
  if (!petKey || !QUIZ_PET_PROFILES[petKey]) return res.status(400).json({ error: '缺少或无效 petKey' })
  try {
    const status = getQuizStatus(petKey)
    return res.json(status)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.get('/api/pets/quiz', requireAuth, async (req, res) => {
  const petKey = String(req.query?.petKey || '').trim()
  if (!petKey || !QUIZ_PET_PROFILES[petKey]) return res.status(400).json({ error: '缺少或无效 petKey' })
  try {
    const quiz = await generateQuiz(petKey)
    return res.json(quiz)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.post('/api/pets/quiz/answer', requireAuth, (req, res) => {
  const petKey = String(req.body?.petKey || '').trim()
  const selectedOption = String(req.body?.selectedOption || '').trim()
  if (!petKey || !QUIZ_PET_PROFILES[petKey]) return res.status(400).json({ error: '缺少或无效 petKey' })
  if (!selectedOption || !['A', 'B', 'C', 'D'].includes(selectedOption.toUpperCase())) {
    return res.status(400).json({ error: '请选择 A/B/C/D 之一' })
  }
  try {
    const result = recordQuizAnswer({ petKey, selectedOption: selectedOption.toUpperCase(), username: req.user.username })
    return res.json({ ok: true, ...result })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

// ---------- 英语单词 PK ----------
const ENGLISH_QUIZ_CACHE = new Map()
const ENGLISH_QUIZ_COOLDOWN_MINUTES = 60
const englishQuizLocks = new Map()

function buildEnglishQuizPrompt() {
  return `你是考研英语词汇出题助手。请出一道考研英语词汇选择题。
要求：
1. 随机选择以下两种题型之一：
   - 给出英文单词，让考生从 4 个中文释义中选择正确的中文意思（mode 为 "en_to_cn"）
   - 给出中文释义，让考生从 4 个英文单词中选择正确的英文单词（mode 为 "cn_to_en"）
2. 题干明确，4 个选项分别标为 A、B、C、D。
3. 单词难度适中，适合考研英语复习。
4. 必须只返回 JSON，不要任何解释、问候、markdown、代码块。JSON 格式如下：
{"mode":"en_to_cn","question":"英文单词","options":{"A":"中文A","B":"中文B","C":"中文C","D":"中文D"},"answer":"A","explanation":"简要解析，说明正确选项和单词含义"}`
}

async function generateEnglishQuiz() {
  if (!KIMI_API_KEY) {
    return {
      status: 'unavailable',
      reason: '未配置 KIMI_API_KEY'
    }
  }

  try {
    const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KIMI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: '你是一个严格按 JSON 格式返回的考研英语词汇出题助手。' },
          { role: 'user', content: buildEnglishQuizPrompt() }
        ],
        temperature: 0.7
      })
    })
    if (!response.ok) {
      const err = await response.text().catch(() => '未知错误')
      throw new Error(`Kimi API 错误: ${err}`)
    }
    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content || ''
    const parsed = parseQuizJson(raw)
    if (!parsed) throw new Error('题目格式解析失败')
    const entry = { ...parsed, generatedAt: nowISO() }
    return { ...entry, status: 'pending' }
  } catch (e) {
    console.error('[english-quiz] generate failed:', e?.message || String(e))
    return { status: 'unavailable', reason: '大模型服务暂不可用' }
  }
}

function getEnglishQuizForUser(userId) {
  const existing = ENGLISH_QUIZ_CACHE.get(userId)
  // 只要有未回答的题目，就一直复用，不重新生成
  if (existing) return { ...existing, status: 'pending' }
  return null
}

function cacheEnglishQuiz(userId, quiz) {
  ENGLISH_QUIZ_CACHE.set(userId, { ...quiz, generatedAt: nowISO() })
}

function readEnglishQuizStats(userId, date) {
  const row = db.prepare('SELECT * FROM english_quiz_daily_stats WHERE user_id = ? AND date = ?').get(userId, date)
  if (!row) return { attempts: 0, correct: 0 }
  return { attempts: Number(row.attempts || 0), correct: Number(row.correct || 0) }
}

function incrementEnglishQuizStats(userId, date, isCorrect) {
  const existing = readEnglishQuizStats(userId, date)
  db.prepare(
    `INSERT INTO english_quiz_daily_stats (user_id, date, attempts, correct, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       attempts = attempts + 1,
       correct = correct + ?,
       updated_at = excluded.updated_at`
  ).run(userId, date, 1, isCorrect ? 1 : 0, nowISO(), isCorrect ? 1 : 0)
}

function recordEnglishQuizAnswer({ userId, selectedOption }) {
  const cached = getEnglishQuizForUser(userId)
  if (!cached) throw new Error('当前没有题目')
  const correct = String(selectedOption).toUpperCase().trim() === String(cached.answer).toUpperCase().trim()
  const date = todayISO()
  incrementEnglishQuizStats(userId, date, correct)
  ENGLISH_QUIZ_CACHE.delete(userId)
  return {
    correct,
    answer: cached.answer,
    explanation: cached.explanation,
    question: cached.question,
    options: cached.options
  }
}

function getUserPetKey(username) {
  if (username === '小鸡毛' || username === 'userA') return 'golden'
  if (username === '小白' || username === 'userB') return 'white'
  return null
}

function getTodayEnglishQuizStats() {
  const date = todayISO()
  const allUsers = readAllUsers()
  const stats = {}
  for (const u of allUsers) {
    stats[u.username] = {
      userId: u.id,
      username: u.username,
      petKey: getUserPetKey(u.username),
      ...readEnglishQuizStats(u.id, date)
    }
  }
  return stats
}

function awardEnglishQuizDailyReward() {
  const date = todayISO()
  const already = db.prepare('SELECT 1 FROM english_quiz_daily_rewards WHERE date = ?').get(date)
  if (already) return null

  const stats = getTodayEnglishQuizStats()
  const entries = Object.values(stats).filter((s) => s.attempts > 0)
  if (entries.length < 2) return null

  entries.sort((a, b) => b.correct - a.correct)
  const first = entries[0]
  const second = entries[1]
  if (first.correct === second.correct) {
    // 平局：不发放奖励，但记录为已处理
    db.prepare('INSERT INTO english_quiz_daily_rewards (date, winner_user_id) VALUES (?, ?)').run(date, null)
    return { tie: true, users: entries.map((e) => e.username) }
  }

  const petKey = first.petKey
  if (!petKey) return null

  const state = decayAndGetState(petKey)
  if (!state) return null
  const happiness = clampStat((state.happiness || 0) + 20)
  db.prepare('UPDATE pet_states SET happiness = ?, updated_at = ? WHERE pet_key = ?').run(happiness, nowISO(), petKey)
  db.prepare('INSERT INTO english_quiz_daily_rewards (date, winner_user_id) VALUES (?, ?)').run(date, first.userId)
  return { winner: first.username, petKey, happiness }
}

function startEnglishQuizRewardScheduler() {
  let lastCheckedDate = ''
  setInterval(() => {
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    const date = todayISO()
    if (hours === 22 && minutes === 0 && lastCheckedDate !== date) {
      awardEnglishQuizDailyReward()
      lastCheckedDate = date
    }
  }, 30 * 1000)
}

app.get('/api/english-quiz', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const cached = getEnglishQuizForUser(userId)
    if (cached) return res.json(cached)

    // 并发控制：同一用户同时只能发起一次大模型请求
    if (englishQuizLocks.has(userId)) {
      await englishQuizLocks.get(userId)
      const newCached = getEnglishQuizForUser(userId)
      return res.json(newCached || { status: 'unavailable', reason: '题目加载失败' })
    }

    let releaseLock = () => {}
    englishQuizLocks.set(userId, new Promise((resolve) => { releaseLock = resolve }))

    try {
      const quiz = await generateEnglishQuiz()
      if (quiz.status === 'pending') {
        cacheEnglishQuiz(userId, quiz)
      }
      return res.json(quiz)
    } finally {
      releaseLock()
      englishQuizLocks.delete(userId)
    }
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.post('/api/english-quiz/answer', requireAuth, (req, res) => {
  const selectedOption = String(req.body?.selectedOption || '').trim()
  if (!selectedOption || !['A', 'B', 'C', 'D'].includes(selectedOption.toUpperCase())) {
    return res.status(400).json({ error: '请选择 A/B/C/D 之一' })
  }
  try {
    const result = recordEnglishQuizAnswer({ userId: req.user.id, selectedOption: selectedOption.toUpperCase() })
    const stats = readEnglishQuizStats(req.user.id, todayISO())
    return res.json({ ok: true, ...result, stats })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.get('/api/english-quiz/stats', requireAuth, (req, res) => {
  try {
    const stats = getTodayEnglishQuizStats()
    return res.json({ date: todayISO(), stats })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.post('/api/english-quiz/award', requireAuth, (req, res) => {
  try {
    const result = awardEnglishQuizDailyReward()
    return res.json({ ok: true, result })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

// ---------- 便利贴 ----------
const STICKY_NOTE_SLOTS = {
  小鸡毛: [
    { type: 'english', label: '英语一', subject: '考研英语一' },
    { type: 'math', label: '数学一', subject: '考研数学一（高等数学、线性代数、概率论与数理统计）' },
    { type: 'cs408', label: '408', subject: '计算机专业基础综合（数据结构、计算机组成原理、操作系统、计算机网络）' }
  ],
  userA: [
    { type: 'english', label: '英语一', subject: '考研英语一' },
    { type: 'math', label: '数学一', subject: '考研数学一（高等数学、线性代数、概率论与数理统计）' },
    { type: 'cs408', label: '408', subject: '计算机专业基础综合（数据结构、计算机组成原理、操作系统、计算机网络）' }
  ],
  小白: [
    { type: 'english', label: '英语', subject: '考研英语' },
    { type: 'math', label: '数学', subject: '考研数学' },
    { type: 'specialty', label: '专业课', subject: '专业课（自动控制原理 / 现代控制理论）' }
  ],
  userB: [
    { type: 'english', label: '英语', subject: '考研英语' },
    { type: 'math', label: '数学', subject: '考研数学' },
    { type: 'specialty', label: '专业课', subject: '专业课（自动控制原理 / 现代控制理论）' }
  ]
}

const CS408_SUBJECTS = [
  '数据结构',
  '计算机组成原理',
  '操作系统',
  '计算机网络'
]

const WHITE_SPECIALTY_SUBJECTS = [
  '自动控制原理',
  '现代控制理论'
]

function buildStickyNotePrompt({ username, slotIndex }) {
  const meta = STICKY_NOTE_SLOTS[username]?.[slotIndex]
  if (!meta) return null

  let detail = ''
  if (meta.type === 'cs408') {
    const subject = CS408_SUBJECTS[Math.floor(Math.random() * CS408_SUBJECTS.length)]
    detail = `，从 408 四门专业课中随机抽取一门：${subject}`
  } else if (meta.type === 'specialty') {
    const subject = WHITE_SPECIALTY_SUBJECTS[Math.floor(Math.random() * WHITE_SPECIALTY_SUBJECTS.length)]
    detail = `，从小白的专业课中随机抽取一门：${subject}`
  }

  const baseInstruction = `你是考研学习助手。请为"${username}"的"${meta.label}"便利贴生成一个适合考研复习的具体记忆点。
主题：${meta.subject}${detail}
要求：
1. 必须给出具体内容，不要只写标题或空洞的“核心记忆点”。
2. 内容要精炼、准确，适合贴在屏幕上看一眼记住。`

  if (meta.type === 'english') {
    return `${baseInstruction}
3. 给出 1 个考研核心英语单词或短语，并提供：
   - 中文释义
   - 一个简短地道的例句
   - 用法提示或常见搭配
4. 标题放英文单词/短语，内容放释义、例句和用法。
5. 必须只返回 JSON，不要任何解释、markdown、代码块。JSON 格式如下：
{"title":"英文单词或短语","content":"中文释义\\n例句：...\\n用法：..."}`
  }

  return `${baseInstruction}
3. 给出一个具体的知识点：可以是公式、定理、概念定义、解题方法、易错点或重要结论。
4. 标题简短（如定理名/公式名/概念名），内容写出具体内容（如公式本身、定理条件与结论、定义细节）。
5. 必须只返回 JSON，不要任何解释、markdown、代码块。JSON 格式如下：
{"title":"知识点标题","content":"具体知识点内容，包含公式/定理/定义/方法等"}`
}

async function generateStickyNote({ username, slotIndex }) {
  if (!KIMI_API_KEY) {
    return { title: '暂未配置 API Key', content: '请在 server/.env 中配置 KIMI_API_KEY 以自动生成便利贴内容。' }
  }

  const prompt = buildStickyNotePrompt({ username, slotIndex })
  if (!prompt) return { title: '未知科目', content: '请检查用户名配置。' }

  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KIMI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [
            { role: 'system', content: '你是一个严格按 JSON 格式返回的考研学习助手。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        })
      })
      if (!response.ok) {
        const err = await response.text().catch(() => '未知错误')
        throw new Error(`Kimi API 错误: ${err}`)
      }
      const data = await response.json()
      const raw = data?.choices?.[0]?.message?.content || ''
      const parsed = parseStickyNoteJson(raw)
      if (!parsed) throw new Error('格式解析失败')
      return { title: String(parsed.title || ''), content: String(parsed.content || '') }
    } catch (e) {
      lastError = e
      console.error(`[sticky-note] generate attempt ${attempt + 1} failed:`, e?.message || String(e))
    }
  }

  console.error('[sticky-note] generate failed after retries:', lastError?.message || String(lastError))
  return { title: '生成失败', content: '大模型服务暂不可用，稍后会自动重试。' }
}

function parseStickyNoteJson(text) {
  if (!text) return null
  const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed.title || !parsed.content) return null
    return { title: String(parsed.title), content: String(parsed.content) }
  } catch {
    return null
  }
}

function readStickyNotes(userId) {
  const rows = db.prepare('SELECT * FROM sticky_notes WHERE user_id = ? ORDER BY slot_index').all(userId)
  return rows.map((r) => ({
    slotIndex: Number(r.slot_index),
    type: r.type,
    title: r.title,
    content: r.content,
    generatedAt: r.generated_at
  }))
}

async function refreshStickyNotesForUser({ userId, username }) {
  const slots = STICKY_NOTE_SLOTS[username]
  if (!slots) return []
  const generatedAt = nowISO()
  const results = []
  for (let i = 0; i < slots.length; i++) {
    const meta = slots[i]
    const note = await generateStickyNote({ username, slotIndex: i })
    db.prepare(
      `INSERT INTO sticky_notes (user_id, slot_index, type, title, content, generated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, slot_index) DO UPDATE SET
         type = excluded.type,
         title = excluded.title,
         content = excluded.content,
         generated_at = excluded.generated_at`
    ).run(userId, i, meta.type, note.title, note.content, generatedAt)
    results.push({ slotIndex: i, type: meta.type, label: meta.label, ...note, generatedAt })
  }
  return results
}

async function refreshAllStickyNotes() {
  const allUsers = readAllUsers()
  for (const u of allUsers) {
    await refreshStickyNotesForUser({ userId: u.id, username: u.username })
  }
}

function getAllStickyNotes() {
  const allUsers = readAllUsers()
  const notes = {}
  for (const u of allUsers) {
    notes[u.username] = readStickyNotes(u.id)
  }
  return notes
}

function startStickyNotesScheduler() {
  // 固定刷新时间：00:00, 12:00（每 12 小时一次，减少 API 调用）
  const REFRESH_HOURS = [0, 12]
  let lastRefreshedDate = ''
  let lastRefreshedHour = -1

  // 启动时如果还没有数据，先刷新一次
  setTimeout(async () => {
    const anyNote = db.prepare('SELECT 1 FROM sticky_notes LIMIT 1').get()
    if (!anyNote) {
      console.log('[sticky-notes] 初始化便利贴...')
      await refreshAllStickyNotes()
    }
  }, 2000)

  setInterval(() => {
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    const date = todayISO()
    if (REFRESH_HOURS.includes(hours) && minutes === 0 && (lastRefreshedDate !== date || lastRefreshedHour !== hours)) {
      console.log(`[sticky-notes] 自动刷新 ${date} ${String(hours).padStart(2, '0')}:00`)
      refreshAllStickyNotes().catch((e) => console.error('[sticky-notes] refresh failed:', e))
      lastRefreshedDate = date
      lastRefreshedHour = hours
    }
  }, 60 * 1000)
}

app.get('/api/sticky-notes', requireAuth, (req, res) => {
  try {
    const notes = getAllStickyNotes()
    return res.json({ notes })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.post('/api/sticky-notes/refresh', requireAuth, async (req, res) => {
  try {
    const result = await refreshStickyNotesForUser({ userId: req.user.id, username: req.user.username })
    return res.json({ ok: true, notes: result })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.get('/api/pets/inventory', requireAuth, (req, res) => {
  const inventory = readUserInventory(req.user.id)
  return res.json({ points: inventory.points, runawayMarks: inventory.runaway_marks, foodConfig: FOOD_CONFIG })
})

app.post('/api/pets/feed', requireAuth, (req, res) => {
  const petKey = String(req.body?.petKey || '').trim()
  const foodKey = String(req.body?.foodKey || '').trim()
  if (!petKey || !foodKey) return res.status(400).json({ error: '缺少 petKey 或 foodKey' })
  if (!FOOD_CONFIG[petKey]?.[foodKey]) return res.status(400).json({ error: '未知食物' })
  try {
    const result = feedPet({ userId: req.user.id, username: req.user.username, petKey, foodKey })
    return res.json({ ok: true, pet: result.state, points: result.remainingPoints, runawayMarksAdded: result.runawayMarksAdded })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
})

app.post('/api/pets/touch', requireAuth, (req, res) => {
  const petKey = String(req.body?.petKey || '').trim()
  if (!petKey) return res.status(400).json({ error: '缺少 petKey' })
  try {
    const state = touchPet({ userId: req.user.id, username: req.user.username, petKey })
    return res.json({ ok: true, pet: state })
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
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

startEnglishQuizRewardScheduler()
startStickyNotesScheduler()

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`)
})
