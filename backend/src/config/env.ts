import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseHost: process.env.DATABASE_HOST || 'localhost',
  databasePort: Number(process.env.DATABASE_PORT || 5432),
  databaseName: process.env.DATABASE_NAME || 'icr',
  databaseUser: process.env.DATABASE_USER || 'postgres',
  databasePassword: process.env.DATABASE_PASSWORD || '12345',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret',
  storageRoot: process.env.STORAGE_ROOT || '../storage'
};

