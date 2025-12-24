import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  statement_timeout: 3000, // 3 seconds
  query_timeout: 3000, // 3 seconds
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

