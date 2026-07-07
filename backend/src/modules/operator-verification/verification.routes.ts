import { Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

export const verificationRouter = Router();

async function finalizeBatchIfDone(queryClient: typeof pool, documentId: number) {
  const batchRows = await queryClient.query(
    `SELECT DISTINCT bd.batch_id FROM batch_documents bd WHERE bd.document_id=$1`,
    [documentId]
  );

  for (const row of batchRows.rows) {
    const batchId = row.batch_id;
    const pending = await queryClient.query(
      `SELECT COUNT(*)::int AS pending_count
         FROM batch_documents bd
         JOIN documents d ON d.id = bd.document_id
        WHERE bd.batch_id=$1 AND d.status NOT IN ('COMPLETED', 'EXPORTED')`,
      [batchId]
    );
    if (Number(pending.rows[0].pending_count) === 0) {
      await queryClient.query(
        `UPDATE batches
         SET status='COMPLETED'
         WHERE id=$1 AND status='IN_PROGRESS'`,
        [batchId]
      );
    }
  }
}

verificationRouter.post(
  '/:id/verify',
  requireAuth,
  requireRole(['OPERATOR', 'SUPERVISOR', 'ADMIN']),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const items = Array.isArray(req.body.cells) ? req.body.cells : [];
    if (!items.length) return res.status(400).json({ message: 'cells is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const it of items) {
        const cellId = Number(it.cellId);
        if (!cellId) continue;
        const value = String(it.value || '');
        await client.query(
          `UPDATE recognition_cells
           SET recognized_value=$1, status='VERIFIED', candidate_values=COALESCE(candidate_values, '[]'::jsonb)
           WHERE id=$2`,
          [value, cellId]
        );
      }
      const jobRows = await client.query(
        `SELECT j.document_id, j.status AS job_status, d.status AS document_status
           FROM recognition_jobs j
           JOIN documents d ON d.id = j.document_id
          WHERE j.id=$1`,
        [jobId]
      );
      if (!jobRows.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Job not found' });
      }

      const { document_id, job_status, document_status } = jobRows.rows[0];
      const verifyAllowedJobStatuses = ['CHECKING', 'RECOGNIZED', 'COMPLETED'];
      const verifyAllowedDocumentStatuses = ['CHECKING', 'RECOGNIZED', 'COMPLETED'];
      if (!verifyAllowedJobStatuses.includes(job_status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: `invalid job state for verification: ${job_status}`
        });
      }
      if (!verifyAllowedDocumentStatuses.includes(document_status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: `invalid document state for verification: ${document_status}`
        });
      }

      const documentId = document_id;

      await client.query(
        `UPDATE recognition_jobs
         SET status='COMPLETED', completed_at=NOW()
         WHERE id=$1`,
        [jobId]
      );
      await client.query(
        `UPDATE documents SET status='COMPLETED' WHERE id=$1`,
        [documentId]
      );
      await client.query(
        `INSERT INTO operator_actions (recognition_job_id, user_id, action, comment)
         VALUES ($1, $2, $3, $4)`,
        [jobId, req.user?.id || null, 'VERIFY', `Verified ${items.length} cells`]
      );
      await finalizeBatchIfDone(client, documentId);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
);

verificationRouter.get(
  '/:id/actions',
  requireAuth,
  async (req, res) => {
    const jobId = Number(req.params.id);
    if (!jobId) {
      return res.status(400).json({ message: 'id is required' });
    }

    const { rows } = await pool.query(
      `SELECT id, action, comment, created_at, user_id
         FROM operator_actions
        WHERE recognition_job_id=$1
        ORDER BY id DESC`,
      [jobId]
    );

    return res.json(rows);
  }
);

verificationRouter.post(
  '/:id/actions',
  requireAuth,
  requireRole(['OPERATOR', 'SUPERVISOR', 'ADMIN']),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const action = String(req.body.action || 'COMMENT').trim();
    const comment = String(req.body.comment || '').trim();

    if (!jobId || !comment) {
      return res.status(400).json({ message: 'id and comment are required' });
    }

    await pool.query(
      `INSERT INTO operator_actions (recognition_job_id, user_id, action, comment)
       VALUES ($1, $2, $3, $4)`,
      [jobId, req.user?.id || null, action, comment]
    );

    return res.status(201).json({ ok: true });
  }
);
