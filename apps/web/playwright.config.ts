import { defineConfig, devices } from '@playwright/test';

/**
 * Sign-up runs in Neon Auth. The tests use the local stand-in in packages/local-auth, which runs
 * the same Better Auth with Neon's cookie names and tokens, and saves its emails as files. So the
 * tests need no internet, and they type the real email code like a person would.
 */
const NEON_AUTH_BASE_URL = 'http://localhost:4300/neondb/auth';
const NEON_AUTH_COOKIE_SECRET = 'e2e-cookie-secret-e2e-cookie-secret-0001';

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_e2e';

const serverEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  APP_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  DATABASE_URL,
  NEON_AUTH_BASE_URL,
  LINK_SECRET: 'e2e-link-secret-e2e-link-secret-e2e-000001',
  MAIL_FROM: 'HireFlow <no-reply@hireflow.local>',
  SMTP_HOST: '',
  RATE_LIMIT_AUTH_PER_MIN: '1000',
  RATE_LIMIT_USER_PER_MIN: '10000',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'sign-in',
      command: 'node src/server.mjs',
      cwd: '../../packages/local-auth',
      url: `${NEON_AUTH_BASE_URL}/ok`,
      env: { ...serverEnv, LOCAL_AUTH_VERIFY_EMAIL: 'true' },
    },
    {
      name: 'api',
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://localhost:4000/api/v1/ready',
      env: { ...serverEnv, PORT: '4000' },
    },
    {
      name: 'worker',
      command: 'node dist/main.js',
      cwd: '../worker',
      env: serverEnv,
    },
    {
      name: 'web',
      command: 'pnpm exec next start --port 3000',
      url: 'http://localhost:3000',
      env: { API_URL: 'http://localhost:4000', NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET },
    },
  ],
});
