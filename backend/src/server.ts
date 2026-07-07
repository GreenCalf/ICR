import { createApp } from './app';
import { env } from './config/env';
import { pool } from './config/db';
import bcrypt from 'bcryptjs';

const app = createApp();

async function ensureDefaultAdmin() {
  const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
  if (rows.length > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash('admin123', 10);
  await pool.query(
    `INSERT INTO users (login, password_hash, full_name, role, active)
     VALUES ($1, $2, $3, $4, TRUE)`,
    ['admin', passwordHash, 'System Admin', 'ADMIN']
  );
}

async function start() {
  await ensureDefaultAdmin();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${env.port}`);
    // eslint-disable-next-line no-console
    console.log('Default admin: login=admin, password=admin123 (set up only on empty DB)');
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start backend', err);
  process.exit(1);
});
