import bcrypt from 'bcryptjs'
import { todayISO } from './database.js'

function getPresetUsersFromEnv() {
  const userAName = (process.env.PRESET_USER_A_NAME || '小鸡毛').trim()
  const userAPass = String(process.env.PRESET_USER_A_PASSWORD || 'please_change_me')
  const userBName = (process.env.PRESET_USER_B_NAME || '小白').trim()
  const userBPass = String(process.env.PRESET_USER_B_PASSWORD || 'please_change_me')

  return [
    { username: userAName, password: userAPass, legacyUsername: 'userA' },
    { username: userBName, password: userBPass, legacyUsername: 'userB' }
  ]
}

export function seedPresetUsers(db) {
  const PRESET_USERS = getPresetUsersFromEnv()

  const findUser = db.prepare('SELECT id FROM users WHERE username = ?')
  const updateUser = db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?')
  const updatePass = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
  const insertUser = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
  const moveTodos = db.prepare('UPDATE todos SET user_id = ? WHERE user_id = ?')
  const moveStudy = db.prepare('UPDATE study_daily SET user_id = ? WHERE user_id = ?')
  const deleteUser = db.prepare('DELETE FROM users WHERE id = ?')

  const tx = db.transaction(() => {
    for (const u of PRESET_USERS) {
      const hash = bcrypt.hashSync(u.password, 10)

      const newRow = findUser.get(u.username)
      const legacyRow = u.legacyUsername ? findUser.get(u.legacyUsername) : null

      // 1) 已有新账号：只更新密码
      if (newRow?.id) {
        updatePass.run(hash, newRow.id)
        // 若旧账号也存在：合并数据到新账号并删除旧账号（避免重复）
        if (legacyRow?.id && Number(legacyRow.id) !== Number(newRow.id)) {
          moveTodos.run(newRow.id, legacyRow.id)
          moveStudy.run(newRow.id, legacyRow.id)
          deleteUser.run(legacyRow.id)
        }
        continue
      }

      // 2) 没有新账号但有旧账号：重命名 + 更新密码（保留原 user_id，数据不丢）
      if (legacyRow?.id) {
        updateUser.run(u.username, hash, legacyRow.id)
        continue
      }

      // 3) 都没有：创建
      insertUser.run(u.username, hash)
    }
  })

  tx()
}

export function seedSampleDataIfEmpty(db) {
  const todoCount = Number(db.prepare('SELECT COUNT(*) AS c FROM todos').get()?.c || 0)

  const users = db.prepare('SELECT id, username FROM users').all()
  const byName = new Map(users.map((u) => [u.username, u.id]))
  const userAId = byName.get('小鸡毛') || byName.get('userA')
  const userBId = byName.get('小白') || byName.get('userB')
  if (!userAId || !userBId) return

  if (todoCount === 0) {
    const insertTodo = db.prepare('INSERT INTO todos (user_id, text, done) VALUES (?, ?, ?)')
    insertTodo.run(userAId, '复习：Vue 3 组合式 API', 0)
    insertTodo.run(userAId, '背单词 30 分钟', 1)
    insertTodo.run(userBId, '刷题：动态规划 2 题', 0)
    insertTodo.run(userBId, '整理错题本', 0)
  }

  // 学习时长不要默认造数据：否则“刚登录就有 52 分钟”会很困惑。
  // 需要演示数据时，启动 server 前设置环境变量：SEED_SAMPLE_STUDY=1
  if (process.env.SEED_SAMPLE_STUDY === '1') {
    const date = todayISO()

    const hasToday = db
      .prepare('SELECT user_id FROM study_daily WHERE date = ? AND user_id IN (?, ?)')
      .all(date, userAId, userBId)
    const hasSet = new Set(hasToday.map((r) => Number(r.user_id)))

    const insertStudy = db.prepare(
      `INSERT INTO study_daily (user_id, date, seconds, updated_at)
       VALUES (?, ?, ?, datetime('now'))`
    )

    if (!hasSet.has(Number(userAId))) insertStudy.run(userAId, date, 35 * 60)
    if (!hasSet.has(Number(userBId))) insertStudy.run(userBId, date, 52 * 60)

    // 历史天：仅在该用户完全没有任何学习记录时补齐 7 天游玩数据
    const countStudyForUser = db.prepare('SELECT COUNT(*) AS c FROM study_daily WHERE user_id = ?')
    const userAStudyCount = Number(countStudyForUser.get(userAId)?.c || 0)
    const userBStudyCount = Number(countStudyForUser.get(userBId)?.c || 0)

    function addDaysISO(dateISO, deltaDays) {
      const [y, m, d] = dateISO.split('-').map((x) => Number(x))
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() + deltaDays)
      const yyyy = dt.getFullYear()
      const mm = String(dt.getMonth() + 1).padStart(2, '0')
      const dd = String(dt.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }

    if (userAStudyCount === 0) {
      for (let i = 6; i >= 1; i--) {
        insertStudy.run(userAId, addDaysISO(date, -i), (20 + i * 3) * 60)
      }
    }

    if (userBStudyCount === 0) {
      for (let i = 6; i >= 1; i--) {
        insertStudy.run(userBId, addDaysISO(date, -i), (28 + i * 4) * 60)
      }
    }
  }
}
