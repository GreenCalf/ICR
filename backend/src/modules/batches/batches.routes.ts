import { Router } from 'express';
import { pool } from '../../config/db';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth';

export const batchesRouter = Router();

batchesRouter.use(requireAuth);

type BatchStatus = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
const batchStatusTransitions: Record<BatchStatus, BatchStatus[]> = {
  NEW: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['COMPLETED', 'CLOSED'],
  COMPLETED: ['CLOSED'],
  CLOSED: []
};

function isBatchTransitionAllowed(from: string, to: string): boolean {
  const allowed = batchStatusTransitions[from as BatchStatus];
  return Boolean(from === to || (allowed && allowed.includes(to as BatchStatus)));
}

batchesRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, status, created_at, created_by FROM batches ORDER BY id DESC`
  );
  return res.json(rows);
});

batchesRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }

  const batch = await pool.query(
    `SELECT id, name, status, created_at, created_by FROM batches WHERE id=$1`,
    [id]
  );
  if (!batch.rows.length) {
    return res.status(404).json({ message: 'Batch not found' });
  }

  const docs = await pool.query(
    `SELECT d.id, d.filename, d.original_name, d.status
       FROM batch_documents bd
       JOIN documents d ON d.id = bd.document_id
      WHERE bd.batch_id=$1
      ORDER BY d.id DESC`,
    [id]
  );

  return res.json({
    ...batch.rows[0],
    documents: docs.rows
  });
});

batchesRouter.post('/', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }

  const status = String(req.body.status || 'NEW');
  const allowedStatuses = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'invalid status' });
  }

  const { rows } = await pool.query(
    `INSERT INTO batches (name, status, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, name, status, created_at`,
    [name, status, req.user?.id || null]
  );
  return res.status(201).json(rows[0]);
});

batchesRouter.post('/:id/documents', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  const batchId = Number(req.params.id);
  if (!batchId) {
    return res.status(400).json({ message: 'id is required' });
  }
  const body = req.body || {};
  const documentIds = Array.isArray(body.documentIds) ? body.documentIds : [];
  if (!documentIds.length) {
    return res.status(400).json({ message: 'documentIds is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const documentId of documentIds) {
      const id = Number(documentId);
      if (!id) continue;
      await client.query(
        `INSERT INTO batch_documents (batch_id, document_id)
         VALUES ($1, $2)
         ON CONFLICT (batch_id, document_id) DO NOTHING`,
        [batchId, id]
      );
    }
    await client.query(
      `UPDATE batches
          SET status='ASSIGNED'
        WHERE id=$1 AND status='NEW'`,
      [batchId]
    );
    await client.query('COMMIT');
    return res.json({ ok: true, batchId, documentIds });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

batchesRouter.patch('/:id/status', requireRole(['ADMIN']), async (req, res) => {
  const batchId = Number(req.params.id);
  if (!batchId) {
    return res.status(400).json({ message: 'id is required' });
  }

  const status = String(req.body.status || '').trim();
  const allowedStatuses = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'invalid status' });
  }

  const current = await pool.query(
    `SELECT status FROM batches WHERE id=$1`,
    [batchId]
  );
  if (!current.rows.length) {
    return res.status(404).json({ message: 'Batch not found' });
  }
  const currentStatus = current.rows[0].status;
  if (!isBatchTransitionAllowed(currentStatus, status)) {
    return res.status(409).json({
      message: `invalid status transition: ${currentStatus} -> ${status}`
    });
  }

  const { rows } = await pool.query(
    `UPDATE batches
       SET status=$1
     WHERE id=$2
     RETURNING id, name, status`,
    [status, batchId]
  );
  if (!rows.length) {
    return res.status(404).json({ message: 'Batch not found' });
  }
  return res.json(rows[0]);
});

batchesRouter.get('/:id/allowed-statuses', requireRole(['ADMIN']), async (req, res) => {
  const batchId = Number(req.params.id);
  if (!batchId) {
    return res.status(400).json({ message: 'id is required' });
  }

  const currentRes = await pool.query('SELECT status FROM batches WHERE id=$1', [batchId]);
  if (!currentRes.rows.length) {
    return res.status(404).json({ message: 'Batch not found' });
  }

  const status = currentRes.rows[0].status as BatchStatus;
  const allowed = batchStatusTransitions[status] ?? [];
  return res.json({
    current: status,
    allowedTransitions: [status, ...allowed]
  });
});

batchesRouter.post('/:id/enqueue', requireRole(['OPERATOR', 'SUPERVISOR', 'ADMIN']), async (req, res) => {
  const batchId = Number(req.params.id);
  if (!batchId) {
    return res.status(400).json({ message: 'id is required' });
  }

  const batchRow = await pool.query('SELECT status FROM batches WHERE id=$1', [batchId]);
  if (!batchRow.rows.length) {
    return res.status(404).json({ message: 'Batch not found' });
  }
  if (!isBatchTransitionAllowed(batchRow.rows[0].status, 'IN_PROGRESS')) {
    return res.status(409).json({
      message: `invalid status transition: ${batchRow.rows[0].status} -> IN_PROGRESS`
    });
  }

  const docs = await pool.query(
    `SELECT d.id
       FROM documents d
       JOIN batch_documents bd ON bd.document_id = d.id
      WHERE bd.batch_id=$1`,
    [batchId]
  );

  if (!docs.rows.length) {
    return res.status(404).json({ message: 'No documents in batch' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const doc of docs.rows) {
      const existing = await client.query(
        `SELECT id FROM recognition_jobs WHERE document_id=$1 AND status IN ('NEW','IN_PROGRESS','COMPLETED')`,
        [doc.id]
      );
      if (existing.rows.length) {
        continue;
      }
      await client.query(
        `INSERT INTO recognition_jobs (document_id, status, created_by)
         VALUES ($1, 'NEW', $2)`,
        [doc.id, req.user?.id || null]
      );
      await client.query(
        `UPDATE documents SET status='PROCESSING' WHERE id=$1`,
        [doc.id]
      );
    }

    await client.query(
      `UPDATE batches SET status='IN_PROGRESS' WHERE id=$1`,
      [batchId]
    );
    await client.query('COMMIT');
    return res.json({ queued: docs.rows.length });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
