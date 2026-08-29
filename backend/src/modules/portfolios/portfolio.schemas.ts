import { z } from 'zod';

export const createPortfolioSchema = z.object({
  workspaceId: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  objective: z.string().trim().max(300).optional(),
  baseCurrencyCode: z.string().trim().length(3).transform((v) => v.toUpperCase()).default('USD'),
});

export const updatePortfolioSchema = createPortfolioSchema.omit({ workspaceId: true }).partial();

