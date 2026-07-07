import { Router } from 'express';
import { pool } from '../../config/db';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth';
import { NextFunction } from 'express';

export const cellsRouter = Router();

cellsRouter.use(requireAuth);

cellsRouter.get('/:formId/cells', async (req, res) => {
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

cellsRouter.post('/:fieldId/cells', requireRole(['ADMIN']), async (req: AuthRequest, res, next: NextFunction) => {
  if (req.baseUrl !== '/api/fields') {
    return next();
  }
  const fieldId = Number(req.params.fieldId);
  if (!fieldId) return res.status(400).json({ message: 'fieldId is required' });

  const fieldRows = await pool.query('SELECT form_id FROM fields WHERE id=$1', [fieldId]);
  if (!fieldRows.rows.length) {
    return res.status(404).json({ message: 'Field not found' });
  }
  const formId = fieldRows.rows[0].form_id as number;

  const body = req.body || {};
  const cellsInput = Array.isArray(body.cells) ? body.cells : [body];
  if (!cellsInput.length) {
    return res.status(400).json({ message: 'cells is required' });
  }

  const created = [];
  for (const rawCell of cellsInput) {
    const { rows } = await pool.query(
      `INSERT INTO cells (
          form_id, field_id, x, y, width, height, position_x, position_y, expected_value
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, form_id, field_id, x, y, width, height, position_x, position_y, expected_value`,
      [
        formId,
        fieldId,
        Number(rawCell.x || 0),
        Number(rawCell.y || 0),
        Number(rawCell.width || 0),
        Number(rawCell.height || 0),
        Number(rawCell.positionX || rawCell.cellNumber || 0),
        Number(rawCell.positionY || 0),
        rawCell.expectedValue || null
      ]
    );
    created.push(rows[0]);
  }

  return res.status(201).json(Array.isArray(req.body.cells) ? created : created[0]);
});

cellsRouter.post('/:formId/cells', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
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
