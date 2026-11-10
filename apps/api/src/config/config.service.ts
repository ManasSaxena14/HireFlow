import { Injectable } from '@nestjs/common';
import { z } from 'zod';

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
    /** The Auth URL from the Neon console, under Settings, Better Auth, Project Info. */
    NEON_AUTH_BASE_URL: z.url().transform((value) => value.replace(/\/+$/, '')),
    /** Signs interview booking links and file download links. */
    LINK_SECRET: z.string().min(32),
    RATE_LIMIT_USER_PER_MIN: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
    FOLLOW_UP_DAYS: z.coerce.number().int().positive().default(7),
    UPLOAD_DIR: z.string().min(1).default('uploads'),
    /**
     * How many proxies sit in front of the API. Rate limits for sign-in count by address, so
     * this must be right: too low and everyone shares the address of the last proxy.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.LINK_SECRET.startsWith(PLACEHOLDER_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['LINK_SECRET'],
        message: 'still has the example value',
      });
    }
    // Plain http is only allowed on this computer, for the load test stand-in.
    const authUrl = new URL(env.NEON_AUTH_BASE_URL);
    if (authUrl.protocol !== 'https:' && authUrl.hostname !== '127.0.0.1') {
      ctx.addIssue({
        code: 'custom',
        path: ['NEON_AUTH_BASE_URL'],
        message: 'must start with https:// in production',
      });
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
