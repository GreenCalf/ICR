import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../../config/db';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole(['ADMIN']));

usersRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, login, full_name, role, active, created_at
     FROM users
     ORDER BY id ASC`
  );
  res.json(rows);
});

usersRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const login = String(body.login || '').trim();
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim();
  const role = String(body.role || 'OPERATOR');
  const active = body.active !== false;

  if (!login || !password) {
    return res.status(400).json({ message: 'login and password are required' });
  }
  if (!['ADMIN', 'OPERATOR', 'SUPERVISOR'].includes(role)) {
    return res.status(400).json({ message: 'invalid role' });
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (login, password_hash, full_name, role, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, login, full_name, role, active, created_at`,
    [login, hash, fullName, role, active]
  );

  res.status(201).json(rows[0]);
});

