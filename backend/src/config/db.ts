import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
  host: env.databaseHost,
  port: env.databasePort,
  database: env.databaseName,
  user: env.databaseUser,
  password: env.databasePassword
});

