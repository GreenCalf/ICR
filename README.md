# ICR Platform

## Quick start

0. Configure PostgreSQL database:
- host: localhost
- port: 5432
- database: `icr`
- user: `postgres`
- password: `12345`

1. Apply DB schema:
- psql -U postgres -d icr -f database/schema.sql
- psql -U postgres -d icr -f database/seeds.sql

2. Install packages:
- `npm install`
- `npm --prefix backend install`
- `npm --prefix recognition-worker install`
- `npm --prefix frontend install`

3. Start backend:
- `npm --prefix backend run dev`
   - default port: `4000` (`http://localhost:4000`)

4. Start recognition worker:
- `npm --prefix recognition-worker run dev`

5. (Optional) Start frontend placeholder:
- `npm --prefix frontend run start`

Default admin (created automatically by backend at first launch if empty DB):  
login `admin`, password `admin123`.

Quick API checks:
- `GET http://localhost:4000/health`
- `GET http://localhost:4000/docs`
- `GET http://localhost:4000/openapi.json`

## Status transition contract (backend-guarded)

Document status API (`PATCH /api/documents/:id/status`) accepts only these transitions:

- `NEW` → `PROCESSING`, `ERROR`
- `PROCESSING` → `CHECKING`, `ERROR`
- `CHECKING` → `RECOGNIZED`, `ERROR`
- `RECOGNIZED` → `COMPLETED`, `ERROR`, `EXPORTED`
- `COMPLETED` → `EXPORTED`
- `ERROR` → `NEW`

Current status helper endpoints:

- `GET /api/documents/:id/allowed-statuses`
- `GET /api/batches/:id/allowed-statuses`

Each returns:

- `current` — текущий статус
- `allowedTransitions` — массив разрешённых статусов с текущим в первой позиции (включая no-op)

Batch auto-closure:

- If all documents in a batch reach final states (`COMPLETED` or `EXPORTED`), batch status is moved automatically to `COMPLETED` (from `IN_PROGRESS`).
- Export endpoint updates document status from `COMPLETED` to `EXPORTED` on successful request.

Batch progress API:

- `GET /api/batches/:id/progress`

Returns:
- `totalDocuments`
- `statusCounts` (by document status)
- `completed` (count of `COMPLETED + EXPORTED`)
- `progressPercent`

`GET /api/batches/:id` now also includes:
- `totalDocuments`
- `statusCounts`
- `completed`
- `progressPercent`

Batch status API (`PATCH /api/batches/:id/status`) accepts only:

- `NEW` → `ASSIGNED`, `IN_PROGRESS`, `CLOSED`
- `ASSIGNED` → `IN_PROGRESS`, `CLOSED`
- `IN_PROGRESS` → `COMPLETED`, `CLOSED`
- `COMPLETED` → `CLOSED`
