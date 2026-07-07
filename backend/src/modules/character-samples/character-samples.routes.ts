import { Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

export const characterSamplesRouter = Router();

characterSamplesRouter.use(requireAuth);

characterSamplesRouter.get('/:formId/character-samples', async (req, res) => {
  const formId = Number(req.params.formId);
  if (!formId) return res.status(400).json({ message: 'formId is required' });

  const fieldId = req.query.fieldId ? Number(req.query.fieldId) : null;
  const query = fieldId
    ? `SELECT id, form_id, field_id, symbol, confidence, image_path, created_at
         FROM character_samples
        WHERE form_id=$1 AND field_id=$2
        ORDER BY id DESC`
    : `SELECT id, form_id, field_id, symbol, confidence, image_path, created_at
         FROM character_samples
        WHERE form_id=$1
        ORDER BY id DESC`;

  const params = fieldId ? [formId, fieldId] : [formId];
  const { rows } = await pool.query(query, params);

  return res.json(rows);
});

characterSamplesRouter.post(
  '/:formId/fields/:fieldId/character-samples',
  requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']),
  async (req, res) => {
    const formId = Number(req.params.formId);
    const fieldId = Number(req.params.fieldId);
    const symbol = String(req.body.symbol || '').trim();
    const confidence = Number(req.body.confidence || 0);
    const imagePath = String(req.body.imagePath || null);

    if (!formId || !fieldId || !symbol) {
      return res.status(400).json({ message: 'formId, fieldId and symbol are required' });
    }
    if (Number.isNaN(confidence)) {
      return res.status(400).json({ message: 'invalid confidence' });
    }

    const { rows } = await pool.query(
      `INSERT INTO character_samples (form_id, field_id, symbol, confidence, image_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, form_id, field_id, symbol, confidence, image_path, created_at`,
      [formId, fieldId, symbol, confidence, imagePath || null]
    );

    return res.status(201).json(rows[0]);
  }
);
