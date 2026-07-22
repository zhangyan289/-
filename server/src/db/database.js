import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
}

export function openDb({ dbPath }) {
  ensureDirForFile(dbPath)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_daily (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      seconds INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 共享状态：两人共同编辑（例如倒计时列表）
    CREATE TABLE IF NOT EXISTS shared_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 桌宠状态：两只宠物共享，双方都能投喂/拖动
    CREATE TABLE IF NOT EXISTS pet_states (
      pet_key TEXT PRIMARY KEY,
      happiness INTEGER NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100),
      runaway INTEGER NOT NULL DEFAULT 0,
      runaway_since TEXT,
      eating_state TEXT,
      eating_until TEXT,
      feed_cooldown_until TEXT,
      total_feeds INTEGER NOT NULL DEFAULT 0,
      last_fed_by TEXT,
      current_state TEXT,
      current_state_updated_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 用户桌宠积分/离家出走标记
    CREATE TABLE IF NOT EXISTS user_pet_inventory (
      user_id INTEGER PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0,
      runaway_marks INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 英语单词 PK 每日统计
    CREATE TABLE IF NOT EXISTS english_quiz_daily_stats (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 英语单词 PK 每日奖励记录
    CREATE TABLE IF NOT EXISTS english_quiz_daily_rewards (
      date TEXT PRIMARY KEY,
      winner_user_id INTEGER,
      awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- 便利贴：每人 3 张，8 小时刷新一次
    CREATE TABLE IF NOT EXISTS sticky_notes (
      user_id INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, slot_index),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
}

export function migratePetStatesV2(db) {
  const cols = db.prepare("PRAGMA table_info(pet_states)").all()
  const hasHunger = cols.some((c) => c.name === 'hunger')
  const hasCurrentState = cols.some((c) => c.name === 'current_state')

  if (hasHunger) {
    // 旧表（含 hunger 列）：重建为新表结构
    const rows = db.prepare('SELECT pet_key, happiness FROM pet_states').all()
    db.prepare('DROP TABLE pet_states').run()
    db.exec(`
      CREATE TABLE pet_states (
        pet_key TEXT PRIMARY KEY,
        happiness INTEGER NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100),
        runaway INTEGER NOT NULL DEFAULT 0,
        runaway_since TEXT,
        eating_state TEXT,
        eating_until TEXT,
        feed_cooldown_until TEXT,
        total_feeds INTEGER NOT NULL DEFAULT 0,
        last_fed_by TEXT,
        current_state TEXT,
        current_state_updated_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    for (const row of rows) {
      const h = Math.max(0, Math.min(100, Number(row.happiness || 0)))
      db.prepare('INSERT INTO pet_states (pet_key, happiness) VALUES (?, ?)').run(row.pet_key, h)
    }
    return
  }

  // 当前表缺少 current_state 列时，直接添加列
  if (!hasCurrentState) {
    db.prepare('ALTER TABLE pet_states ADD COLUMN current_state TEXT').run()
    db.prepare('ALTER TABLE pet_states ADD COLUMN current_state_updated_at TEXT').run()
  }
}

export function addUserPetInventoryColumns(db) {
  const cols = db.prepare("PRAGMA table_info(user_pet_inventory)").all()
  const hasFoodJson = cols.some((c) => c.name === 'food_json')
  const hasRunawayMarks = cols.some((c) => c.name === 'runaway_marks')
  if (hasFoodJson) {
    db.prepare('ALTER TABLE user_pet_inventory DROP COLUMN food_json').run()
  }
  if (!hasRunawayMarks) {
    db.prepare('ALTER TABLE user_pet_inventory ADD COLUMN runaway_marks INTEGER NOT NULL DEFAULT 0').run()
  }
}

export function migrateEnglishQuizTables(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  if (!tables.includes('english_quiz_daily_stats')) {
    db.exec(`
      CREATE TABLE english_quiz_daily_stats (
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `)
  }
  if (!tables.includes('english_quiz_daily_rewards')) {
    db.exec(`
      CREATE TABLE english_quiz_daily_rewards (
        date TEXT PRIMARY KEY,
        winner_user_id INTEGER,
        awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `)
  }
  if (!tables.includes('sticky_notes')) {
    db.exec(`
      CREATE TABLE sticky_notes (
        user_id INTEGER NOT NULL,
        slot_index INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, slot_index),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `)
  }
}

export function seedPetStatesIfEmpty(db) {
  const exists = db.prepare("SELECT 1 FROM pet_states LIMIT 1").get()
  if (exists) return
  const now = new Date()
  const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  db.prepare(
    `INSERT INTO pet_states (pet_key, happiness, updated_at) VALUES (?, ?, ?)`
  ).run('golden', 70, nowStr)
  db.prepare(
    `INSERT INTO pet_states (pet_key, happiness, updated_at) VALUES (?, ?, ?)`
  ).run('white', 70, nowStr)
}

export function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
