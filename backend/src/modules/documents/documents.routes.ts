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
  const { rows } = await pool.query(
    `SELECT id, filename, original_name, form_id, status, created_by, created_at
     FROM documents ORDER BY id DESC`
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

  const existing = await pool.query(
    `SELECT id, status
       FROM recognition_jobs
      WHERE document_id=$1
      ORDER BY id DESC
      LIMIT 1`,
    [documentId]
  );

  if (existing.rows.length && ['NEW', 'PROCESSING'].includes(existing.rows[0].status)) {
    return res.status(200).json({
      jobId: existing.rows[0].id,
      documentId,
      status: existing.rows[0].status
    });
  }

  const inserted = await pool.query(
    `INSERT INTO recognition_jobs (document_id, status, created_by)
     VALUES ($1, 'NEW', $2)
     RETURNING id, document_id, status`,
    [documentId, req.user?.id || null]
  );

  await pool.query(
    `UPDATE documents SET status='PROCESSING' WHERE id=$1`,
    [documentId]
  );

  return res.status(201).json({
    jobId: inserted.rows[0].id,
    documentId: inserted.rows[0].document_id,
    status: 'PENDING'
  });
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
