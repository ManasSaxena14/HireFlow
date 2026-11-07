import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.string().default('info'),
    APP_URL: z.url().transform((value) => value.replace(/\/+$/, '')),
    DATABASE_URL: z.string().min(1),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().min(1),
    UPLOAD_DIR: z.string().min(1).default('uploads'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || Boolean(env.SMTP_HOST), {
    path: ['SMTP_HOST'],
    message: 'is required in production',
  });

export type Env = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
