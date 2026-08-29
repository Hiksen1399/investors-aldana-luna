import { env } from '../../../shared/config/env.js';

type CachedQuote = { fetchedAt: Date; marketStatus: string | null };

export class QuoteCacheService {
  constructor(
    private readonly openTtlSeconds = env.MARKET_QUOTE_CACHE_SECONDS,
    private readonly closedTtlSeconds = env.MARKET_CLOSED_CACHE_SECONDS,
  ) {}

  isFresh(quote: CachedQuote, now = new Date()): boolean {
    const ttl = quote.marketStatus === 'CLOSED' ? this.closedTtlSeconds : this.openTtlSeconds;
    return now.getTime() - quote.fetchedAt.getTime() < ttl * 1_000;
  }
}

export const quoteCacheService = new QuoteCacheService();

