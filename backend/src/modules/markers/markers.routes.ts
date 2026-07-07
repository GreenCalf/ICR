import { Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

export const markersRouter = Router();

markersRouter.use(requireAuth);

markersRouter.post('/:formId/markers', requireRole(['ADMIN']), async (req, res) => {
  const formId = Number(req.params.formId);
  if (!formId) {
    return res.status(400).json({ message: 'formId is required' });
  }

  const body = req.body || {};
  const kind = String(body.markerType || body.kind || 'SQUARE');
  const x = Number(body.x || 0);
  const y = Number(body.y || 0);
  const width = Number(body.width || 0);
  const height = Number(body.height || 0);

  const { rows } = await pool.query(
    `INSERT INTO markers (form_id, kind, x, y, width, height)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, form_id, kind, x, y, width, height, created_at`,
    [formId, kind, x, y, width, height]
  );

  return res.status(201).json(rows[0]);
});

markersRouter.put('/:id', requireRole(['ADMIN']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }

  const current = await pool.query('SELECT * FROM markers WHERE id=$1', [id]);
  if (!current.rows.length) {
    return res.status(404).json({ message: 'Marker not found' });
  }

  const marker = current.rows[0];
  const body = req.body || {};
  const kind = String(body.markerType || body.kind || marker.kind);
  const x = Number(body.x !== undefined ? body.x : marker.x);
  const y = Number(body.y !== undefined ? body.y : marker.y);
  const width = Number(body.width !== undefined ? body.width : marker.width);
  const height = Number(body.height !== undefined ? body.height : marker.height);

  const { rows } = await pool.query(
    `UPDATE markers
        SET kind=$1, x=$2, y=$3, width=$4, height=$5
      WHERE id=$6
      RETURNING id, form_id, kind, x, y, width, height, created_at`,
    [kind, x, y, width, height, id]
  );

  return res.json(rows[0]);
});

markersRouter.delete('/:id', requireRole(['ADMIN']), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }

  const { rowCount } = await pool.query('DELETE FROM markers WHERE id=$1', [id]);
  if (!rowCount) {
    return res.status(404).json({ message: 'Marker not found' });
  }

  return res.status(204).send();
});

