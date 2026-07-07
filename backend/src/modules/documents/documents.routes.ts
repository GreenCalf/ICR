import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';

const storageDir = path.resolve(env.storageRoot, 'documents');
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      cb(null, storageDir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  })
});

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

type DocumentStatus = 'NEW' | 'PROCESSING' | 'RECOGNIZED' | 'CHECKING' | 'COMPLETED' | 'EXPORTED' | 'ERROR';

const documentStatusTransitions: Record<DocumentStatus, DocumentStatus[]> = {
  NEW: ['PROCESSING', 'ERROR'],
  PROCESSING: ['CHECKING', 'ERROR'],
  CHECKING: ['RECOGNIZED', 'ERROR'],
  RECOGNIZED: ['COMPLETED', 'ERROR', 'EXPORTED'],
  COMPLETED: ['EXPORTED'],
  EXPORTED: [],
  ERROR: ['NEW']
};

function isDocumentTransitionAllowed(from: string, to: DocumentStatus): boolean {
  const allowed = documentStatusTransitions[from as DocumentStatus];
  return Boolean(from === to || (allowed && allowed.includes(to)));
}

documentsRouter.get('/', async (req, res) => {
  const status = String(req.query.status || '').trim().toUpperCase();
  const templateId = Number(req.query.templateId || req.query.formId || 0);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);

  const pageNum = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const limitNum = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: any[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status=$${params.length}`);
  }
  if (templateId > 0) {
    params.push(templateId);
    conditions.push(`form_id=$${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limitNum, offset);

  const { rows } = await pool.query(
    `SELECT id, filename, original_name, form_id, status, created_by, created_at
     FROM documents
     ${where}
     ORDER BY id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

documentsRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.filename, d.original_name, d.form_id, d.status, d.created_by, d.created_at,
            f.name as form_name
     FROM documents d
     LEFT JOIN forms f ON f.id = d.form_id
     WHERE d.id=$1`,
    [Number(req.params.id)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  res.json(rows[0]);
});

async function createDocument(req: any, res: any) {
  const formId = Number(req.body.formId || req.body.templateId || 0);
  if (!req.file) {
    return res.status(400).json({ message: 'file is required' });
  }
  if (!formId) {
    return res.status(400).json({ message: 'formId is required' });
  }

  const filename = req.file.filename;
  const originalName = req.file.originalname || '';

  const { rows } = await pool.query(
    `INSERT INTO documents (form_id, filename, original_name, storage_path, created_by, status)
      VALUES ($1, $2, $3, $4, $5, 'NEW')
      RETURNING id, form_id, filename, original_name, storage_path, status, created_at`,
    [formId, filename, originalName, req.file.path, req.user?.id || null]
  );
  return res.status(201).json(rows[0]);
}

documentsRouter.post('/', upload.single('file'), async (req, res) => {
  return createDocument(req, res);
});

documentsRouter.post('/upload', upload.single('file'), async (req, res) => {
  return createDocument(req, res);
});

documentsRouter.post('/:id/recognize', async (req, res) => {
  const documentId = Number(req.params.id);
  if (!documentId) {
    return res.status(400).json({ message: 'id is required' });
  }

  const docRes = await pool.query(
    `SELECT id, form_id, status FROM documents WHERE id=$1`,
    [documentId]
  );
  if (!docRes.rows.length) {
    return res.status(404).json({ message: 'Document not found' });
  }

  const documentRow = docRes.rows[0];
  if (!documentRow.form_id) {
    return res.status(400).json({ message: 'Document has no template form' });
  }

  const existing = await pool.query(
    `SELECT id, status
       FROM recognition_jobs
      WHERE document_id=$1
      ORDER BY id DESC
      LIMIT 1`,
    [documentId]
  );

  if (existing.rows.length && ['NEW', 'PROCESSING', 'RECOGNIZED', 'CHECKING'].includes(existing.rows[0].status)) {
    return res.status(200).json({
      jobId: existing.rows[0].id,
      documentId,
      status: existing.rows[0].status
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO recognition_jobs (document_id, status, created_by)
       VALUES ($1, 'PROCESSING', $2)
       RETURNING id, document_id, status`,
      [documentId, req.user?.id || null]
    );
    const jobId = inserted.rows[0].id as number;

    const cellsRes = await client.query(
      `SELECT id, position_x, position_y
         FROM cells
        WHERE form_id=$1
        ORDER BY id ASC`,
      [documentRow.form_id]
    );
    if (!cellsRes.rows.length) {
      await client.query(
        `UPDATE recognition_jobs SET status='COMPLETED', completed_at=NOW() WHERE id=$1`,
        [jobId]
      );
      await client.query(
        `UPDATE documents SET status='COMPLETED' WHERE id=$1`,
        [documentId]
      );
      await client.query('COMMIT');
      return res.status(201).json({
        jobId: inserted.rows[0].id,
        documentId: inserted.rows[0].document_id,
        status: inserted.rows[0].status
      });
    }

    for (const cell of cellsRes.rows) {
      const mockChar = String.fromCharCode(1040 + (Number(cell.id) % 6));
      const candidates = [
        { symbol: mockChar, confidence: 0.84 },
        { symbol: String.fromCharCode(1040 + ((Number(cell.id) + 1) % 6)), confidence: 0.66 }
      ];
      await client.query(
        `INSERT INTO recognition_cells
          (recognition_job_id, form_cell_id, recognized_value, candidate_values, confidence, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [jobId, Number(cell.id), mockChar, JSON.stringify(candidates), 0.84]
      );
    }

    await client.query(
      `UPDATE documents SET status='PROCESSING' WHERE id=$1`,
      [documentId]
    );
    await client.query(
      `UPDATE recognition_jobs SET status='CHECKING' WHERE id=$1`,
      [jobId]
    );
    await client.query(
      `UPDATE documents SET status='CHECKING' WHERE id=$1`,
      [documentId]
    );
    await client.query('COMMIT');

    return res.status(201).json({
      jobId,
      documentId,
      status: 'PENDING'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

documentsRouter.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }
  const status = String(req.body.status || '').trim();
  const allowed = ['NEW', 'PROCESSING', 'RECOGNIZED', 'CHECKING', 'COMPLETED', 'EXPORTED', 'ERROR'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: 'invalid status' });
  }

  const current = await pool.query(`SELECT status FROM documents WHERE id=$1`, [id]);
  if (!current.rows.length) {
    return res.status(404).json({ message: 'Not found' });
  }
  const currentStatus = current.rows[0].status;
  if (!isDocumentTransitionAllowed(currentStatus, status as DocumentStatus)) {
    return res.status(409).json({
      message: `invalid status transition: ${currentStatus} -> ${status}`
    });
  }

  const { rows } = await pool.query(
    `UPDATE documents SET status=$1 WHERE id=$2 RETURNING id, status`,
    [status, id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  res.json(rows[0]);
});

documentsRouter.get('/:id/allowed-statuses', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }

  const currentRes = await pool.query('SELECT status FROM documents WHERE id=$1', [id]);
  if (!currentRes.rows.length) {
    return res.status(404).json({ message: 'Not found' });
  }

  const status = currentRes.rows[0].status as DocumentStatus;
  const allowed = documentStatusTransitions[status] ?? [];
  return res.json({
    current: status,
    allowedTransitions: [status, ...allowed]
  });
});
