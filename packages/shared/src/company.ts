import { z } from 'zod';
import { MEMBERSHIP_ROLES } from './enums.js';

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use only small letters, numbers and dashes')
  .min(2)
  .max(60);

export const createCompanySchema = z.object({
  name: z.string().trim().min(2, 'Enter the company name').max(120),
  slug: slug.optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    careersEnabled: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

const role = z.enum(MEMBERSHIP_ROLES);

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role,
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({ role });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
