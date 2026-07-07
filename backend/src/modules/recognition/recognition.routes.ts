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
  const formId = docRows.rows[0].form_id;
  const cellsRes = await pool.query(
    `SELECT id FROM cells WHERE form_id=$1 ORDER BY id ASC`,
    [formId]
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO recognition_jobs (document_id, status, created_by)
       VALUES ($1, 'PROCESSING', $2)
       RETURNING id, document_id, status, created_at`,
      [documentId, req.user?.id || null]
    );
    const jobId = rows[0].id as number;

    for (const row of cellsRes.rows) {
      const mockChar = String.fromCharCode(1040 + (Number(row.id) % 6));
      const candidates = [
        { symbol: mockChar, confidence: 0.84 },
        { symbol: String.fromCharCode(1040 + ((Number(row.id) + 2) % 6)), confidence: 0.56 }
      ];
      await client.query(
        `INSERT INTO recognition_cells
         (recognition_job_id, form_cell_id, recognized_value, candidate_values, confidence, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [jobId, row.id, mockChar, JSON.stringify(candidates), 0.84]
      );
    }

    if (!cellsRes.rows.length) {
      await client.query(`UPDATE recognition_jobs SET status='COMPLETED', completed_at=NOW() WHERE id=$1`, [jobId]);
      await client.query(`UPDATE documents SET status='COMPLETED' WHERE id=$1`, [documentId]);
      await client.query('COMMIT');
      return res.status(201).json(rows[0]);
    }

    await client.query(`UPDATE recognition_jobs SET status='CHECKING' WHERE id=$1`, [jobId]);
    await client.query(`UPDATE documents SET status='CHECKING' WHERE id=$1`, [documentId]);
    await client.query('COMMIT');
    res.status(201).json({
      id: rows[0].id,
      document_id: rows[0].document_id,
      status: 'PENDING'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
