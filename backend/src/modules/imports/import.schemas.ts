import { z } from 'zod';

const decimalString = z.union([z.string(), z.number()]).transform((value) => String(value));

export const uploadImportSchema = z.object({
  accountId: z.preprocess((value) => value === '' ? undefined : value, z.uuid().optional()),
  broker: z.enum(['HAPI', 'XTB']).optional(),
  documentPassword: z.string().max(200).optional(),
});

export const normalizedImportOperationSchema = z.object({
  broker: z.enum(['HAPI', 'XTB']),
  accountId: z.uuid().optional(),
  externalAccountNumber: z.string().max(100).optional(),
  externalOrderId: z.string().max(160).optional(),
  sourceSymbol: z.string().trim().min(1).max(100),
  symbol: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
  providerSymbol: z.string().trim().min(1).max(100),
  assetName: z.string().trim().min(1).max(180),
  assetType: z.enum(['STOCK', 'ETF', 'FUND', 'BOND', 'CRYPTO', 'FOREX', 'COMMODITY', 'CASH', 'OTHER']),
  exchange: z.string().max(80).optional(),
  side: z.enum(['BUY', 'SELL']),
  quantity: decimalString.refine((value) => Number(value) > 0, 'La cantidad debe ser mayor que cero.'),
  unitPrice: decimalString.refine((value) => Number(value) >= 0, 'El precio no puede ser negativo.'),
  grossAmount: decimalString.refine((value) => Number(value) >= 0),
  fees: decimalString.default('0'),
  taxes: decimalString.default('0'),
  currencyCode: z.string().length(3).transform((value) => value.toUpperCase()),
  exchangeRate: decimalString.default('1'),
  executedAt: z.iso.datetime({ offset: true }),
  confidence: z.number().min(0).max(100),
  warnings: z.array(z.string()).default([]),
  marketDataMatch: z.object({
    provider: z.literal('TWELVE_DATA'),
    symbol: z.string().min(1).max(30),
    providerSymbol: z.string().min(1).max(100),
    name: z.string().min(1).max(180),
    exchange: z.string().max(80).optional(),
    country: z.string().max(100).optional(),
    currency: z.string().length(3),
    confidence: z.number().min(0).max(100),
  }).optional(),
});

export const reviewImportRowSchema = normalizedImportOperationSchema.partial().omit({ broker: true, confidence: true, warnings: true });
export const rowIdParamsSchema = z.object({ rowId: z.uuid() });
export const batchIdParamsSchema = z.object({ id: z.uuid() });

export const inboundEmailSchema = z.object({
  to: z.email(),
  from: z.email(),
  subject: z.string().max(500).optional(),
  text: z.string().max(500_000).optional(),
  html: z.string().max(500_000).optional(),
  messageId: z.string().max(300).optional(),
  receivedAt: z.iso.datetime({ offset: true }).optional(),
  attachments: z.array(z.object({ filename: z.string().min(1).max(300), contentType: z.string().max(120).optional(), contentBase64: z.string().min(1) })).max(10).optional(),
});

export const outlookCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const outlookSyncSchema = z.object({
  lookbackMonths: z.coerce.number().int().min(1).max(60).optional(),
});

export const xtbPdfPasswordSchema = z.object({
  accountId: z.uuid(),
  password: z.string().min(1).max(200),
});

export const xtbAccountParamsSchema = z.object({ accountId: z.uuid() });
