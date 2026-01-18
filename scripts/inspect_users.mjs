import Database from 'better-sqlite3'
import path from 'node:path'

const dbFile = path.resolve('server/data/app.sqlite')
const db = new Database(dbFile)

const users = db.prepare('SELECT id, username, password_hash FROM users ORDER BY id').all()
console.log('DB:', dbFile)
console.table(users.map(u => ({ id: u.id, username: u.username, password_hash_prefix: String(u.password_hash || '').slice(0, 18) + '…' })))
