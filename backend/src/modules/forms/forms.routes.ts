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

formsRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'id is required' });

  const formRes = await pool.query(
    'SELECT id, name, template_json, created_at FROM forms WHERE id=$1',
    [id]
  );
  if (!formRes.rows.length) {
    return res.status(404).json({ message: 'Form not found' });
  }

  const form = formRes.rows[0];

  const markersRes = await pool.query(
    'SELECT id, kind, x, y, width, height, created_at FROM markers WHERE form_id=$1 ORDER BY id ASC',
    [id]
  );
  const fieldsRes = await pool.query(
    'SELECT id, form_id, name, code, data_type, required, allowed_chars, validation_rule, created_at FROM fields WHERE form_id=$1 ORDER BY id ASC',
    [id]
  );
  const cellsRes = await pool.query(
    'SELECT id, form_id, field_id, x, y, width, height, position_x, position_y, expected_value FROM cells WHERE form_id=$1 ORDER BY id ASC',
    [id]
  );

  return res.json({
    ...form,
    markers: markersRes.rows,
    fields: fieldsRes.rows,
    cells: cellsRes.rows
  });
});

formsRouter.put('/:id', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'id is required' });

  const body = req.body || {};
  const currentRes = await pool.query(
    'SELECT name, template_json FROM forms WHERE id=$1',
    [id]
  );
  if (!currentRes.rows.length) {
    return res.status(404).json({ message: 'Form not found' });
  }

  const current = currentRes.rows[0];
  const name = String(body.name || current.name).trim();
  const template = body.template !== undefined ? body.template : current.template_json;

  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }

  const { rows } = await pool.query(
    'UPDATE forms SET name=$1, template_json=$2 WHERE id=$3 RETURNING id, name, template_json, created_at',
    [name, template, id]
  );
  res.json(rows[0]);
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
