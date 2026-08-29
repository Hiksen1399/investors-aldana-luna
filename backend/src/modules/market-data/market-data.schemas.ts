import { z } from 'zod';

const numericString = z.union([z.string(), z.number()]).transform(String);
const nullableNumericString = z.union([z.string(), z.number(), z.null(), z.undefined()]).transform((value) => value == null || value === '' ? null : String(value));

export const twelveDataErrorSchema = z.object({
  status: z.string().optional(),
  code: z.coerce.number().optional(),
  message: z.string(),
});

export const twelveDataQuoteSchema = z.object({
  symbol: z.string(),
  name: z.string().default(''),
  exchange: z.string().nullable().optional(),
  currency: z.string().default('USD'),
  datetime: z.string().nullable().optional(),
  timestamp: z.union([z.string(), z.number()]).nullable().optional(),
  open: nullableNumericString,
  high: nullableNumericString,
  low: nullableNumericString,
  close: numericString,
  previous_close: nullableNumericString,
  change: nullableNumericString,
  percent_change: nullableNumericString,
  is_market_open: z.boolean().nullable().optional(),
});

export const twelveDataTimeSeriesSchema = z.object({
  meta: z.object({
    symbol: z.string(),
    interval: z.string(),
    currency: z.string().default('USD'),
    exchange: z.string().optional(),
  }),
  values: z.array(z.object({
    datetime: z.string(),
    open: numericString,
    high: numericString,
    low: numericString,
    close: numericString,
    volume: nullableNumericString,
  })),
});

export const twelveDataSymbolSearchSchema = z.object({
  status: z.string().optional(),
  data: z.array(z.object({
    symbol: z.string(),
    instrument_name: z.string(),
    exchange: z.string().nullable().optional(),
    mic_code: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    currency: z.string().default('USD'),
    instrument_type: z.string().default('Other'),
  })),
});

export const assetIdParamsSchema = z.object({ assetId: z.uuid() });
export const portfolioIdParamsSchema = z.object({ portfolioId: z.uuid() });
export const quotesQuerySchema = z.object({
  assetIds: z.string().min(1).transform((value, context) => {
    const ids = [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))];
    if (!ids.length || ids.length > 50 || ids.some((id) => !z.uuid().safeParse(id).success)) {
      context.addIssue({ code: 'custom', message: 'assetIds debe contener entre 1 y 50 UUID válidos.' });
      return z.NEVER;
    }
    return ids;
  }),
});
export const historyQuerySchema = z.object({
  interval: z.enum(['1min', '5min', '15min', '30min', '1h', '1day', '1week']).default('1day'),
  from: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)),
  to: z.iso.date().transform((value) => new Date(`${value}T23:59:59.999Z`)),
}).refine((value) => value.from <= value.to, { message: 'La fecha inicial debe ser anterior a la final.' });
