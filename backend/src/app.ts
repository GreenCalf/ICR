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

  app.get('/', (_req, res) => {
    res.send(
      '<!doctype html><html><head><meta charset="utf-8"><title>ICR Platform</title></head>' +
      '<body style="font-family:Arial,sans-serif;padding:24px;"><h1>ICR Platform API</h1>' +
      '<ul><li><a href="/health">Health</a></li>' +
      '<li><a href="/docs">Swagger docs</a></li>' +
      '<li><a href="/openapi.json">OpenAPI JSON</a></li></ul></body></html>'
    );
  });

  app.get('/openapi.json', (_req, res) => {
    res.sendFile(openApiPath, (err) => {
      if (err) {
        res.status(404).json({ message: 'OpenAPI spec not found' });
      }
    });
  });

  app.get('/docs', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ICR API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html, body, #swagger-ui {
        margin: 0;
        padding: 0;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        if (!window.SwaggerUIBundle) {
          document.body.innerHTML = '<div style="padding:16px;font-family:Arial,sans-serif;">Swagger UI library could not be loaded. OpenAPI spec: <a href="/openapi.json">/openapi.json</a></div>';
          return;
        }
        SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis]
        });
      };
    </script>
  </body>
</html>`);
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
