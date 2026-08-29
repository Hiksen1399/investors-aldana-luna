import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default('postgresql://portfolio:portfolio_dev@localhost:5432/mi_portafolio?schema=public'),
  FRONTEND_URL: z.string().url().default('http://localhost:4200'),
  JWT_ACCESS_SECRET: z.string().min(32).default('development-only-secret-change-me-now'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  TWELVE_DATA_API_KEY: z.string().default(''),
  TWELVE_DATA_BASE_URL: z.string().url().default('https://api.twelvedata.com'),
  MARKET_DATA_PROVIDER: z.string().default('twelve-data'),
  MARKET_QUOTE_CACHE_SECONDS: z.coerce.number().int().positive().default(60),
  MARKET_CLOSED_CACHE_SECONDS: z.coerce.number().int().positive().default(900),
  INBOUND_EMAIL_SECRET: z.string().min(16).default('development-inbound-secret'),
  IMPORT_EMAIL_DOMAIN: z.string().min(3).default('imports.localhost'),
  MICROSOFT_CLIENT_ID: z.string().default(''),
  MICROSOFT_CLIENT_SECRET: z.string().default(''),
  MICROSOFT_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/imports/outlook/callback'),
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  OUTLOOK_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1_440).default(5),
});

export const env = envSchema.parse(process.env);
