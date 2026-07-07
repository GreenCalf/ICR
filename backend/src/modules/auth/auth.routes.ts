import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { requireAuth, AuthRequest } from '../../middleware/auth';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const login = String(req.body.login || '');
  const password = String(req.body.password || '');
  if (!login || !password) {
    return res.status(400).json({ message: 'login and password are required' });
  }

  const { rows } = await pool.query(
    'SELECT id, login, password_hash, role, active FROM users WHERE login = $1',
    [login]
  );
  if (!rows.length) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok || !user.active) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, login: user.login, role: user.role },
    env.jwtSecret,
    { expiresIn: '12h' }
  );

  return res.json({ token });
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  return res.json({ user: req.user });
});

