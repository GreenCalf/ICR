import { Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth } from '../../middleware/auth';

export const recognitionRouter = Router();
recognitionRouter.use(requireAuth);

recognitionRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, document_id, status, worker_id, created_at, started_at, completed_at
     FROM recognition_jobs ORDER BY id DESC`
  );
  res.json(rows);
});

recognitionRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, document_id, status, worker_id, created_at, started_at, completed_at
     FROM recognition_jobs WHERE id=$1`,
    [Number(req.params.id)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  res.json(rows[0]);
});

recognitionRouter.get('/:id/cells', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, recognition_job_id, form_cell_id, recognized_value, candidate_values,
            confidence, status, created_at
     FROM recognition_cells
     WHERE recognition_job_id=$1
     ORDER BY id ASC`,
    [Number(req.params.id)]
  );
  res.json(rows);
});

recognitionRouter.get('/document/:documentId', async (req, res) => {
  const documentId = Number(req.params.documentId);
  const { rows } = await pool.query(
    `SELECT id, document_id, status, worker_id, created_at, started_at, completed_at
     FROM recognition_jobs WHERE document_id=$1 ORDER BY id DESC`,
    [documentId]
  );
  res.json(rows);
});

recognitionRouter.post('/', async (req, res) => {
  const documentId = Number(req.body.documentId || 0);
  if (!documentId) {
    return res.status(400).json({ message: 'documentId is required' });
  }

  const { rows: docRows } = await pool.query(
    'SELECT id, form_id FROM documents WHERE id=$1',
    [documentId]
  );
  if (!docRows.length) return res.status(404).json({ message: 'Document not found' });

  const { rows } = await pool.query(
    `INSERT INTO recognition_jobs (document_id, status, created_by)
     VALUES ($1, 'NEW', $2) RETURNING id, document_id, status, created_at`,
    [documentId, req.user?.id || null]
  );

  await pool.query(
    `UPDATE documents SET status='PROCESSING' WHERE id=$1`,
    [documentId]
  );

  res.status(201).json(rows[0]);
});
