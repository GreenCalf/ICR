import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';

type ExportStatus = 'NEW' | 'COMPLETED' | 'FAILED';
type ExportFormat = 'CSV' | 'JSON' | 'XML' | 'API' | 'XLSX';

interface ExportJob {
  id: number;
  batchId: number;
  format: ExportFormat;
  status: ExportStatus;
  createdAt: string;
  fileName?: string;
  path?: string;
}

const exportJobs = new Map<number, ExportJob>();
let exportJobCounter = 1;

export const exportsRouter = Router();
exportsRouter.use(requireAuth);

exportsRouter.post('/', async (req, res) => {
  const batchId = Number(req.body.batchId || 0);
  const format = String(req.body.format || 'JSON').toUpperCase() as ExportFormat;
  const allowedFormats: ExportFormat[] = ['CSV', 'JSON', 'XML', 'API', 'XLSX'];

  if (!batchId) {
    return res.status(400).json({ message: 'batchId is required' });
  }
  if (!allowedFormats.includes(format)) {
    return res.status(400).json({ message: 'unsupported format' });
  }

  const batchRows = await pool.query('SELECT id, status FROM batches WHERE id=$1', [batchId]);
  if (!batchRows.rows.length) {
    return res.status(404).json({ message: 'Batch not found' });
  }

  const jobId = exportJobCounter++;
  const createdAt = new Date().toISOString();
  const job: ExportJob = {
    id: jobId,
    batchId,
    format,
    status: 'NEW',
    createdAt
  };
  exportJobs.set(jobId, job);

  try {
    const documents = await pool.query(
      `SELECT d.id FROM batch_documents bd
         JOIN documents d ON d.id = bd.document_id
        WHERE bd.batch_id=$1
        ORDER BY d.id ASC`,
      [batchId]
    );

    const payload = [];
    for (const row of documents.rows) {
      const data = await getDocumentExport(row.id);
      if (data) {
        payload.push(data);
      }
      if (data) {
        await markDocumentExported(row.id);
      }
    }

  if (format === 'CSV') {
      const csvRows = ['batch_id,document_id,field_code,recognized_value,confidence'];
      for (const doc of payload) {
        for (const r of doc.rows) {
          const line = [
            batchId,
            doc.documentId,
            r.field_code || '',
            r.recognized_value || '',
            r.confidence ?? ''
          ]
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(',');
          csvRows.push(line);
        }
      }
      const exportPath = path.resolve(env.storageRoot, 'exports', `export-${jobId}.csv`);
      await fs.promises.mkdir(path.dirname(exportPath), { recursive: true });
      await fs.promises.writeFile(exportPath, csvRows.join('\r\n'), 'utf8');
      job.fileName = `export-${jobId}.csv`;
      job.path = exportPath;
  } else if (format === 'XML') {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<batch id="${batchId}">`,
        ...payload.map((doc: any) => {
          const rows = doc.rows.map((r: any) => `    <field code="${r.field_code || ''}" confidence="${r.confidence ?? ''}"><value>${r.recognized_value || ''}</value></field>`).join('');
          return `  <document id="${doc.documentId}">${rows}</document>`;
        }),
        '</batch>'
      ].join('\n');
      const exportPath = path.resolve(env.storageRoot, 'exports', `export-${jobId}.xml`);
      await fs.promises.mkdir(path.dirname(exportPath), { recursive: true });
      await fs.promises.writeFile(exportPath, xml, 'utf8');
      job.fileName = `export-${jobId}.xml`;
      job.path = exportPath;
    } else {
      job.fileName = `export-${jobId}.json`;
      const exportPath = path.resolve(env.storageRoot, 'exports', `export-${jobId}.json`);
      await fs.promises.mkdir(path.dirname(exportPath), { recursive: true });
      await fs.promises.writeFile(exportPath, JSON.stringify({ batchId, rows: payload }, null, 2), 'utf8');
      job.path = exportPath;
    }

    job.status = 'COMPLETED';
    return res.status(201).json({
      exportId: job.id,
      status: job.status
    });
  } catch (error) {
    job.status = 'FAILED';
    return res.status(500).json({ message: 'Export failed' });
  }
});

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

exportsRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'id is required' });

  const job = exportJobs.get(id);
  if (!job) {
    return res.status(404).json({ message: 'Export not found' });
  }
  return res.json(job);
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
