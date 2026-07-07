import { Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

export const verificationRouter = Router();

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
        const status = String(it.status || 'VERIFIED');
        await client.query(
          `UPDATE recognition_cells
           SET recognized_value=$1, status='VERIFIED', candidate_values=COALESCE(candidate_values, '[]'::jsonb)
           WHERE id=$2`,
          [value, cellId]
        );
      }
      const jobRows = await client.query(
        `SELECT document_id FROM recognition_jobs WHERE id=$1`,
        [jobId]
      );
      if (!jobRows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Job not found' });
      }
      const documentId = jobRows.rows[0].document_id;

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

