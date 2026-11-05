import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.APP_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-0001';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-01';
process.env.RATE_LIMIT_USER_PER_MIN = '100000';
process.env.RATE_LIMIT_AUTH_PER_MIN = '100000';
