import { Router } from 'express';
import { pool } from '../../config/db';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth';

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

verificationRouter.get(
  '/batches',
  requireAuth,
  requireRole(['OPERATOR', 'SUPERVISOR', 'ADMIN']),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, status, created_at, created_by
         FROM batches
        WHERE status IN ('ASSIGNED', 'IN_PROGRESS')
        ORDER BY id DESC`
    );
    return res.json(rows);
  }
);

verificationRouter.get(
  '/batches/:batchId/next-cell',
  requireAuth,
  requireRole(['OPERATOR', 'SUPERVISOR', 'ADMIN']),
  async (req, res) => {
    const batchId = Number(req.params.batchId);
    if (!batchId) {
      return res.status(400).json({ message: 'batchId is required' });
    }

    const nextCellRes = await pool.query(
      `SELECT
         bd.batch_id,
         d.id AS document_id,
         rc.id AS recognition_cell_id,
         rc.recognition_job_id,
         rc.recognized_value AS model_symbol,
         rc.confidence AS model_confidence,
         rc.candidate_values,
         f.id AS field_id,
         f.name AS field_name,
         f.code AS field_code,
         c.id AS cell_id,
         c.position_x AS cell_number,
         c.expected_value,
         d.storage_path
       FROM batch_documents bd
       JOIN documents d ON d.id = bd.document_id
       JOIN recognition_jobs j ON j.document_id = d.id
       JOIN recognition_cells rc ON rc.recognition_job_id = j.id
       JOIN cells c ON c.id = rc.form_cell_id
       JOIN fields f ON f.id = c.field_id
       WHERE bd.batch_id = $1
         AND rc.status IN ('NEW', 'PENDING')
         AND j.status IN ('NEW', 'PROCESSING', 'CHECKING', 'RECOGNIZED')
       ORDER BY rc.id ASC
       LIMIT 1`,
      [batchId]
    );

    if (!nextCellRes.rows.length) {
      return res.status(404).json({ message: 'No pending cells in batch' });
    }

    const row = nextCellRes.rows[0];
    return res.json({
      batchId: row.batch_id,
      documentId: row.document_id,
      recognitionCellId: row.recognition_cell_id,
      field: {
        id: row.field_id,
        name: row.field_name,
        label: row.field_code || row.field_name
      },
      cell: {
        id: row.cell_id,
        cellNumber: row.cell_number
      },
      cellImagePath: row.storage_path,
      modelSymbol: row.model_symbol,
      modelConfidence: row.model_confidence ? Number(row.model_confidence) : null,
      alternatives: Array.isArray(row.candidate_values)
        ? row.candidate_values
        : []
    });
  }
);

verificationRouter.put(
  '/cells/:recognitionCellId/verify',
  requireAuth,
  requireRole(['OPERATOR', 'SUPERVISOR', 'ADMIN']),
  async (req: AuthRequest, res) => {
    const recognitionCellId = Number(req.params.recognitionCellId);
    if (!recognitionCellId) {
      return res.status(400).json({ message: 'recognitionCellId is required' });
    }

    const verifiedSymbol = String(req.body.verifiedSymbol || req.body.value || '').trim();
    if (!verifiedSymbol) {
      return res.status(400).json({ message: 'verifiedSymbol is required' });
    }

    const actionType = String(req.body.actionType || 'CORRECT').toUpperCase();
    const resolvedStatus = actionType === 'CORRECT' || actionType === 'CORRECTED' ? 'CORRECTED' : 'VERIFIED';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cellRow = await client.query(
        `SELECT rc.id, rc.recognition_job_id, j.document_id
           FROM recognition_cells rc
           JOIN recognition_jobs j ON j.id = rc.recognition_job_id
          WHERE rc.id=$1`,
        [recognitionCellId]
      );
      if (!cellRow.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Recognition cell not found' });
      }

      const recognitionJobId = cellRow.rows[0].recognition_job_id as number;
      const documentId = cellRow.rows[0].document_id as number;

      await client.query(
        `UPDATE recognition_cells
         SET recognized_value=$1, status=$2
         WHERE id=$3`,
        [verifiedSymbol, resolvedStatus, recognitionCellId]
      );

      const pending = await client.query(
        `SELECT COUNT(*)::int AS pending_count
           FROM recognition_cells
          WHERE recognition_job_id=$1
            AND status IN ('NEW', 'PENDING')`,
        [recognitionJobId]
      );

      if (Number(pending.rows[0].pending_count) === 0) {
        await client.query(
          `UPDATE recognition_jobs
              SET status='COMPLETED', completed_at=NOW()
            WHERE id=$1`,
          [recognitionJobId]
        );
        await client.query(
          `UPDATE documents
              SET status='COMPLETED'
            WHERE id=$1`,
          [documentId]
        );
        await finalizeBatchIfDone(client, documentId);
      } else {
        await client.query(
          `UPDATE recognition_jobs
              SET status='CHECKING'
            WHERE id=$1`,
          [recognitionJobId]
        );
        await client.query(
          `UPDATE documents
              SET status='CHECKING'
            WHERE id=$1`,
          [documentId]
        );
      }

      await client.query(
        `INSERT INTO operator_actions (recognition_job_id, user_id, action, comment)
         VALUES ($1, $2, $3, $4)`,
        [recognitionJobId, req.user?.id || null, actionType, `Verified cell ${recognitionCellId}`]
      );
      await client.query('COMMIT');
      return res.json({
        id: recognitionCellId,
        status: resolvedStatus,
        verifiedSymbol
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
);

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
