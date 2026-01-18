import jwt from 'jsonwebtoken'

export function authRequired({ jwtSecret }) {
  return (req, res, next) => {
    try {
      const header = req.headers.authorization || ''
      const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
      if (!token) return res.status(401).json({ error: 'Unauthorized' })

      const payload = jwt.verify(token, jwtSecret)
      req.user = {
        id: payload.sub,
        username: payload.username
      }
      return next()
    } catch {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }
}
