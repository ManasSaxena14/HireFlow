import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const PLACEHOLDER_SECRET = 'replace-with';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.string().default('info'),
    PORT: z.coerce.number().int().default(4000),
    APP_URL: z.url().transform((value) => value.replace(/\/+$/, '')),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) => value.split(',').map((origin) => origin.trim())),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: flag.default(false),
    RATE_LIMIT_USER_PER_MIN: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
    FOLLOW_UP_DAYS: z.coerce.number().int().positive().default(7),
    UPLOAD_DIR: z.string().min(1).default('uploads'),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must be different from JWT_ACCESS_SECRET',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (env[name].startsWith(PLACEHOLDER_SECRET)) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'still has the example value' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}

@Injectable()
export class ConfigService {
  readonly env: Env = parseEnv(process.env);

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
