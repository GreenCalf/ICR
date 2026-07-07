import { NextFunction, Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

export const fieldsRouter = Router();

fieldsRouter.use(requireAuth);

fieldsRouter.get('/:formId/fields', async (req, res) => {
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

fieldsRouter.put('/:id', requireRole(['ADMIN']), async (req, res, next: NextFunction) => {
  if (req.baseUrl !== '/api/fields') {
    return next();
  }
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }

  const current = await pool.query(
    `SELECT id, name, code, data_type, required, allowed_chars, validation_rule
       FROM fields WHERE id=$1`,
    [id]
  );
  if (!current.rows.length) {
    return res.status(404).json({ message: 'Field not found' });
  }

  const field = current.rows[0];
  const body = req.body || {};
  const name = String(body.name || field.name).trim();
  const code = String(body.code || field.code).trim();
  const dataType = String(body.dataType || field.data_type);
  const required = body.required !== undefined ? Boolean(body.required) : field.required;
  const allowedChars = String(body.allowedChars || field.allowed_chars || '');
  const validationRule = body.validationRule ? JSON.stringify(body.validationRule) : field.validation_rule;

  if (!name || !code) {
    return res.status(400).json({ message: 'name and code are required' });
  }

  const { rows } = await pool.query(
    `UPDATE fields
        SET name=$1, code=$2, data_type=$3, required=$4, allowed_chars=$5, validation_rule=$6
      WHERE id=$7
      RETURNING id, form_id, name, code, data_type, required, allowed_chars, validation_rule`,
    [name, code, dataType, required, allowedChars, validationRule, id]
  );

  return res.json(rows[0]);
});

fieldsRouter.delete('/:id', requireRole(['ADMIN']), async (req, res, next: NextFunction) => {
  if (req.baseUrl !== '/api/fields') {
    return next();
  }
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }

  const { rowCount } = await pool.query('DELETE FROM fields WHERE id=$1', [id]);
  if (!rowCount) {
    return res.status(404).json({ message: 'Field not found' });
  }
  return res.status(204).send();
});

fieldsRouter.post('/:formId/fields', requireRole(['ADMIN']), async (req, res) => {
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
