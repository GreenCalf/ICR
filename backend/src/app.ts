import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { formsRouter } from './modules/forms/forms.routes';
import { fieldsRouter } from './modules/fields/fields.routes';
import { cellsRouter } from './modules/cells/cells.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { batchesRouter } from './modules/batches/batches.routes';
import { recognitionRouter } from './modules/recognition/recognition.routes';
import { characterSamplesRouter } from './modules/character-samples/character-samples.routes';
import { verificationRouter } from './modules/operator-verification/verification.routes';
import { exportsRouter } from './modules/exports/exports.routes';

export function createApp() {
  const app = express();
  const openApiPath = path.resolve(__dirname, '../../docs/openapi.json');

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(path.resolve(env.storageRoot, 'documents')));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/openapi.json', (_req, res) => {
    res.sendFile(openApiPath, (err) => {
      if (err) {
        res.status(404).json({ message: 'OpenAPI spec not found' });
      }
    });
  });

  app.get('/docs', (_req, res) => {
    res.type('html').send('<!doctype html><html><body><h1>ICR API</h1><p>OpenAPI spec: <a href="/openapi.json">/openapi.json</a></p></body></html>');
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/forms', formsRouter);
  app.use(fieldsRouter);
  app.use(cellsRouter);
  app.use('/api/batches', batchesRouter);
  app.use(characterSamplesRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/recognition-jobs', recognitionRouter);
  app.use('/api/recognition-jobs', verificationRouter);
  app.use('/api/exports', exportsRouter);

  app.use((err: any, _req: any, res: any, _next: any) => {
    // eslint-disable-next-line no-console
    console.error(err);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ message: 'Internal error' });
  });

  return app;
}
