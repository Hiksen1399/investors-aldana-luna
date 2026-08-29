import { z } from 'zod';

const decimalInput = z.union([z.string(), z.number()]).transform((value) => String(value));
const assetInput = z.object({
  ticker: z.string().trim().min(1).max(30).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(180),
  type: z.enum(['STOCK', 'ETF', 'FUND', 'BOND', 'CRYPTO', 'FOREX', 'COMMODITY', 'CASH', 'OTHER']).default('STOCK'),
  exchange: z.string().trim().max(80).optional(),
  sector: z.string().trim().max(120).optional(),
});

export const createTransactionSchema = z.object({
  accountId: z.uuid(),
  assetId: z.uuid().optional(),
  asset: assetInput.optional(),
  type: z.enum(['TRADE', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST', 'FEE', 'TAX', 'CURRENCY_CONVERSION', 'TRANSFER', 'SPLIT', 'ADJUSTMENT']),
  side: z.enum(['BUY', 'SELL']).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).default('CONFIRMED'),
  tradeAt: z.iso.datetime({ offset: true }),
  quantity: decimalInput.optional(),
  unitPrice: decimalInput.optional(),
  grossAmount: decimalInput.optional(),
  fees: decimalInput.default('0'),
  taxes: decimalInput.default('0'),
  exchangeRate: decimalInput.default('1'),
  currencyCode: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  externalId: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  if (value.type === 'TRADE') {
    if (!value.side) context.addIssue({ code: 'custom', path: ['side'], message: 'Selecciona compra o venta.' });
    if (!value.assetId && !value.asset) context.addIssue({ code: 'custom', path: ['asset'], message: 'Selecciona o registra un activo.' });
    if (!value.quantity || Number(value.quantity) <= 0) context.addIssue({ code: 'custom', path: ['quantity'], message: 'La cantidad debe ser mayor que cero.' });
    if (!value.unitPrice || Number(value.unitPrice) < 0) context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Indica el precio unitario.' });
  } else if (!value.grossAmount || Number(value.grossAmount) <= 0) {
    context.addIssue({ code: 'custom', path: ['grossAmount'], message: 'El valor debe ser mayor que cero.' });
  }
});

export const updateTransactionSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
  tradeAt: z.iso.datetime({ offset: true }).optional(),
  quantity: decimalInput.optional(),
  unitPrice: decimalInput.optional(),
  grossAmount: decimalInput.optional(),
  fees: decimalInput.optional(),
  taxes: decimalInput.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

