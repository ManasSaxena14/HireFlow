import { z } from 'zod';
import { timezoneSchema } from './common.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'Use at most 200 characters');
const fullName = z.string().trim().min(1, 'Enter your name').max(120);

export const registerSchema = z.object({
  email,
  password,
  fullName,
  timezone: timezoneSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** The code Neon Auth emails to confirm an address. */
export const verifyEmailSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6 digit code from the email'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: z.string().min(1), password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z
  .object({ fullName, timezone: timezoneSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
