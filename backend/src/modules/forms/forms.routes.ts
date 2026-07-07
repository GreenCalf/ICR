import { Router } from 'express';
import { pool } from '../../config/db';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth';

export const formsRouter = Router();

formsRouter.use(requireAuth);

formsRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, template_json, created_at FROM forms ORDER BY id DESC'
  );
  res.json(rows);
});

formsRouter.post('/', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const template = body.template || {};

  if (!name) return res.status(400).json({ message: 'name is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const formIns = await client.query(
      'INSERT INTO forms (name, template_json, created_by) VALUES ($1, $2, $3) RETURNING id, name, template_json, created_at',
      [name, template, req.user?.id || null]
    );
    const form = formIns.rows[0];

    if (Array.isArray(body.fields)) {
      for (const f of body.fields) {
        const { rows: fi } = await client.query(
          `INSERT INTO fields (
              form_id, name, code, data_type, required, allowed_chars, validation_rule
            ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            form.id,
            f.name || '',
            f.code || '',
            f.dataType || 'text',
            Boolean(f.required),
            f.allowedChars || '',
            f.validationRule || null
          ]
        );
        const fieldId = fi[0].id;
        const cells = Array.isArray(f.cells) ? f.cells : [];
        for (const c of cells) {
          await client.query(
            `INSERT INTO cells (form_id, field_id, x, y, width, height, position_x, position_y, expected_value)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              form.id,
              fieldId,
              c.x || 0,
              c.y || 0,
              c.width || 0,
              c.height || 0,
              c.positionX ?? 0,
              c.positionY ?? 0,
              c.expectedValue || null
            ]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json(form);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

