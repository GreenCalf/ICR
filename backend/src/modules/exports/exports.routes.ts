import { Router } from 'express';
import { pool } from '../../config/db';
import { requireAuth } from '../../middleware/auth';

export const exportsRouter = Router();
exportsRouter.use(requireAuth);

exportsRouter.get('/documents/:documentId/json', async (req, res) => {
  const documentId = Number(req.params.documentId);
  await markDocumentExported(documentId);
  const data = await getDocumentExport(documentId);
  if (!data) return res.status(404).json({ message: 'Not found' });
  res.json(data);
});

exportsRouter.get('/documents/:documentId/csv', async (req, res) => {
  const documentId = Number(req.params.documentId);
  await markDocumentExported(documentId);
  const data = await getDocumentExport(documentId);
  if (!data) return res.status(404).json({ message: 'Not found' });

  const rows = data.rows.map(
    (r: any) => `${r.field_code};${r.recognized_value};${r.confidence ?? ''}`
  );
  const csv = ['field_code;recognized_value;confidence', ...rows].join('\r\n');
  res.header('Content-Type', 'text/csv');
  res.attachment(`document-${documentId}-export.csv`);
  res.send(csv);
});

async function finalizeBatchIfDone(documentId: number) {
  const batchRows = await pool.query(
    `SELECT DISTINCT bd.batch_id FROM batch_documents bd WHERE bd.document_id=$1`,
    [documentId]
  );

  for (const row of batchRows.rows) {
    const batchId = row.batch_id;
    const pending = await pool.query(
      `SELECT COUNT(*)::int AS pending_count
         FROM batch_documents bd
         JOIN documents d ON d.id = bd.document_id
        WHERE bd.batch_id=$1 AND d.status NOT IN ('COMPLETED', 'EXPORTED')`,
      [batchId]
    );
    if (Number(pending.rows[0].pending_count) === 0) {
      await pool.query(
        `UPDATE batches
         SET status='COMPLETED'
         WHERE id=$1 AND status='IN_PROGRESS'`,
        [batchId]
      );
    }
  }
}

async function markDocumentExported(documentId: number) {
  const { rowCount } = await pool.query(
    `UPDATE documents SET status='EXPORTED' WHERE id=$1 AND status='COMPLETED'`,
    [documentId]
  );
  if (rowCount) {
    await finalizeBatchIfDone(documentId);
  }
}

async function getDocumentExport(documentId: number) {
  const header = await pool.query('SELECT id, filename, status FROM documents WHERE id=$1', [documentId]);
  if (!header.rows.length) return null;

  const rc = await pool.query(
    `SELECT
      cj.code AS field_code,
      c.expected_value,
      rc.recognized_value,
      rc.confidence,
      rc.candidate_values
    FROM documents d
    JOIN recognition_jobs j ON j.document_id = d.id
    LEFT JOIN recognition_cells rc ON rc.recognition_job_id = j.id
    LEFT JOIN cells c ON c.id = rc.form_cell_id
    LEFT JOIN fields cj ON cj.id = c.field_id
    WHERE d.id=$1 AND j.status='COMPLETED'
    ORDER BY rc.id ASC`,
    [documentId]
  );

  return {
    documentId: header.rows[0].id,
    fileName: header.rows[0].filename,
    status: header.rows[0].status,
    rows: rc.rows
  };
}
