import { resetTestDb } from '../../../scripts/reset-test-db.mjs';

export default async function setup(): Promise<void> {
  await resetTestDb(
    process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test',
  );
}
