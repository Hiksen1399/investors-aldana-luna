import { z } from 'zod';

export const createAccountSchema = z.object({
  portfolioId: z.uuid(),
  brokerId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  externalAccountNumber: z.string().trim().max(100).optional(),
  objective: z.string().trim().max(300).optional(),
  currencyCode: z.string().trim().length(3).transform((v) => v.toUpperCase()).default('USD'),
  autoImportEnabled: z.boolean().default(false),
});

export const updateAccountSchema = createAccountSchema.omit({ portfolioId: true, brokerId: true }).partial();

