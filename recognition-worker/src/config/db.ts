import { Pool } from 'pg';
import { workerEnv } from './env';

export const pool = new Pool({
  host: workerEnv.databaseHost,
  port: workerEnv.databasePort,
  database: workerEnv.databaseName,
  user: workerEnv.databaseUser,
  password: workerEnv.databasePassword
});

