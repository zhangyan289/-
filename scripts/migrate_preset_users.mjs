import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'node:path'

const dbFile = process.env.DB_FILE || path.resolve('server/data/app.sqlite')
const db = new Database(dbFile)

db.pragma('foreign_keys = ON')

const presets = /** @type {{ legacy: string, newName: string, newPass: string }[]} */ ([
  {
    legacy: 'userA',
    newName: (process.env.PRESET_USER_A_NAME || '小鸡毛').trim(),
    newPass: String(process.env.PRESET_USER_A_PASSWORD || 'please_change_me')
  },
  {
    legacy: 'userB',
    newName: (process.env.PRESET_USER_B_NAME || '小白').trim(),
    newPass: String(process.env.PRESET_USER_B_PASSWORD || 'please_change_me')
  }
])

const findByName = db.prepare('SELECT id, username FROM users WHERE username = ?')
const updateUser = db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?')
const updatePass = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
const insertUser = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
const moveTodos = db.prepare('UPDATE todos SET user_id = ? WHERE user_id = ?')
const moveStudy = db.prepare('UPDATE study_daily SET user_id = ? WHERE user_id = ?')
const deleteUser = db.prepare('DELETE FROM users WHERE id = ?')

const tx = db.transaction(() => {
  for (const p of presets) {
    const newRow = findByName.get(p.newName)
    const legacyRow = findByName.get(p.legacy)
    const hash = bcrypt.hashSync(p.newPass, 10)

    if (newRow?.id) {
      updatePass.run(hash, newRow.id)
      if (legacyRow?.id && Number(legacyRow.id) !== Number(newRow.id)) {
        moveTodos.run(newRow.id, legacyRow.id)
        moveStudy.run(newRow.id, legacyRow.id)
        deleteUser.run(legacyRow.id)
      }
      continue
    }

    if (legacyRow?.id) {
      updateUser.run(p.newName, hash, legacyRow.id)
      continue
    }

    insertUser.run(p.newName, hash)
  }
})

tx()

const users = db.prepare('SELECT id, username FROM users ORDER BY id').all()
console.log('Migrated DB:', dbFile)
console.table(users)
