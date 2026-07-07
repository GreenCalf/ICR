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

4. Start recognition worker:
- `npm --prefix recognition-worker run dev`

5. (Optional) Start frontend placeholder:
- `npm --prefix frontend run start`

Default admin (created automatically by backend at first launch if empty DB):  
login `admin`, password `admin123`.

