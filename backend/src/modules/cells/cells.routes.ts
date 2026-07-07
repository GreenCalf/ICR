import { Router } from 'express';
import { pool } from '../../config/db';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth';

export const cellsRouter = Router();

cellsRouter.use(requireAuth);

cellsRouter.get('/api/forms/:formId/cells', async (req, res) => {
  const formId = Number(req.params.formId);
  if (!formId) return res.status(400).json({ message: 'formId is required' });

  const { rows } = await pool.query(
    `SELECT id, form_id, field_id, x, y, width, height, position_x, position_y, expected_value
     FROM cells
     WHERE form_id=$1
     ORDER BY id ASC`,
    [formId]
  );
  res.json(rows);
});

cellsRouter.post('/api/forms/:formId/cells', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  const formId = Number(req.params.formId);
  if (!formId) return res.status(400).json({ message: 'formId is required' });

  const body = req.body || {};
  const fieldId = Number(body.fieldId || 0);
  if (!fieldId) return res.status(400).json({ message: 'fieldId is required' });

  const { rows } = await pool.query(
    `INSERT INTO cells (
        form_id, field_id, x, y, width, height, position_x, position_y, expected_value
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id, form_id, field_id, x, y, width, height, position_x, position_y, expected_value`,
    [
      formId,
      fieldId,
      Number(body.x || 0),
      Number(body.y || 0),
      Number(body.width || 0),
      Number(body.height || 0),
      Number(body.positionX || 0),
      Number(body.positionY || 0),
      body.expectedValue || null
    ]
  );

  res.status(201).json(rows[0]);
});

