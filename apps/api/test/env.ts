import 'reflect-metadata';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.APP_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test';
process.env.NEON_AUTH_BASE_URL = 'https://auth.neon.test/neondb/auth';
process.env.LINK_SECRET = 'test-link-secret-test-link-secret-test-0001';
process.env.RATE_LIMIT_USER_PER_MIN = '100000';
process.env.RATE_LIMIT_AUTH_PER_MIN = '100000';
process.env.UPLOAD_DIR = join(tmpdir(), 'hireflow-test-uploads');
