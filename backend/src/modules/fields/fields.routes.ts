import { Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

export const fieldsRouter = Router();

fieldsRouter.use(requireAuth);

fieldsRouter.get('/api/forms/:formId/fields', async (req, res) => {
  const formId = Number(req.params.formId);
  if (!formId) return res.status(400).json({ message: 'formId is required' });

  const { rows } = await pool.query(
    `SELECT id, form_id, name, code, data_type, required, allowed_chars, validation_rule, created_at
     FROM fields
     WHERE form_id=$1
     ORDER BY id ASC`,
    [formId]
  );
  res.json(rows);
});

fieldsRouter.post('/api/forms/:formId/fields', requireRole(['ADMIN']), async (req, res) => {
  const formId = Number(req.params.formId);
  if (!formId) return res.status(400).json({ message: 'formId is required' });

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const code = String(body.code || '').trim();
  const dataType = String(body.dataType || 'text');
  const required = Boolean(body.required);
  const allowedChars = String(body.allowedChars || '');
  const validationRule = body.validationRule ? JSON.stringify(body.validationRule) : null;

  if (!name || !code) {
    return res.status(400).json({ message: 'name and code are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO fields (form_id, name, code, data_type, required, allowed_chars, validation_rule)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, form_id, name, code, data_type, required, allowed_chars, validation_rule`,
    [formId, name, code, dataType, required, allowedChars, validationRule]
  );

  res.status(201).json(rows[0]);
});
