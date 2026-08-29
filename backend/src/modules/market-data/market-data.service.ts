import type { LatestMarketQuote, MarketPrice } from '@prisma/client';
import { env } from '../../shared/config/env.js';
import { MarketDataError, MarketDataProviderError } from './market-data.errors.js';
import { marketDataRepository, type MarketDataRepository } from './market-data.repository.js';
import type { NormalizedMarketQuote } from './market-data.types.js';
import type { MarketDataProvider } from './providers/market-data-provider.interface.js';
import { TwelveDataProvider } from './providers/twelve-data.provider.js';
import { quoteCacheService, type QuoteCacheService } from './services/quote-cache.service.js';
import { symbolMapperService, type SymbolMapperService } from './services/symbol-mapper.service.js';

const toNumber = (value: { toString(): string } | null) => value == null ? null : Number(value.toString());

export class MarketDataService {
  constructor(
    private readonly repository: MarketDataRepository = marketDataRepository,
    private readonly provider: MarketDataProvider = new TwelveDataProvider(),
    private readonly cache: QuoteCacheService = quoteCacheService,
    private readonly symbolMapper: SymbolMapperService = symbolMapperService,
  ) {}

  async getQuote(userId: string, assetId: string): Promise<NormalizedMarketQuote> {
    const { asset, mapping } = await this.symbolMapper.resolveAccessibleAsset(userId, assetId, env.MARKET_DATA_PROVIDER);
    const cached = await this.repository.getLatestQuote(assetId);
    if (cached && this.cache.isFresh(cached)) return this.normalizeQuote(asset, mapping.providerSymbol, cached, false);

    try {
      const providerQuote = await this.provider.getQuote(mapping.providerSymbol);
      const saved = await this.repository.upsertLatestQuote(assetId, asset.currencyCode, providerQuote);
      return this.normalizeQuote(asset, mapping.providerSymbol, saved, false);
    } catch (error) {
      if (cached) return this.normalizeQuote(asset, mapping.providerSymbol, cached, true);
      throw this.toHttpError(error);
    }
  }

  async getQuotes(userId: string, assetIds: string[]) {
    return Promise.all([...new Set(assetIds)].map((assetId) => this.getQuote(userId, assetId)));
  }

  async getHistoricalPrices(userId: string, assetId: string, interval: string, from: Date, to: Date) {
    const { asset, mapping } = await this.symbolMapper.resolveAccessibleAsset(userId, assetId, env.MARKET_DATA_PROVIDER);
    const cached = await this.repository.getHistoricalPrices(assetId, interval, from, to);
    if (this.hasCoverage(cached, from, to)) return this.normalizeHistory(cached);
    try {
      const values = await this.provider.getHistoricalPrices({ symbol: mapping.providerSymbol, interval, startDate: from, endDate: to });
      await this.repository.saveHistoricalPrices(assetId, asset.currencyCode, values);
      return this.normalizeHistory(await this.repository.getHistoricalPrices(assetId, interval, from, to));
    } catch (error) {
      if (cached.length) return this.normalizeHistory(cached, true);
      throw this.toHttpError(error);
    }
  }

  async getExchangeRate(baseCurrency: string, quoteCurrency: string): Promise<{ rate: number; fetchedAt: Date; stale: boolean }> {
    if (baseCurrency === quoteCurrency) return { rate: 1, fetchedAt: new Date(), stale: false };
    const cached = await this.repository.getLatestExchangeRate(baseCurrency, quoteCurrency, this.provider.name);
    if (cached && Date.now() - cached.fetchedAt.getTime() < env.MARKET_QUOTE_CACHE_SECONDS * 1_000) return { rate: Number(cached.rate), fetchedAt: cached.fetchedAt, stale: false };
    try {
      const quote = await this.provider.getQuote(`${baseCurrency}/${quoteCurrency}`);
      const saved = await this.repository.saveExchangeRate({ baseCurrencyCode: baseCurrency, quoteCurrencyCode: quoteCurrency, rate: quote.price, rateAt: quote.providerTimestamp ?? quote.fetchedAt, fetchedAt: quote.fetchedAt, source: quote.provider });
      return { rate: Number(saved.rate), fetchedAt: saved.fetchedAt, stale: false };
    } catch (error) {
      if (cached) return { rate: Number(cached.rate), fetchedAt: cached.fetchedAt, stale: true };
      throw this.toHttpError(error);
    }
  }

  private normalizeQuote(asset: { id: string; ticker: string; name: string; exchange: string | null; currencyCode: string }, providerSymbol: string, quote: LatestMarketQuote, stale: boolean): NormalizedMarketQuote {
    return {
      assetId: asset.id,
      symbol: asset.ticker,
      providerSymbol,
      name: asset.name,
      exchange: asset.exchange,
      currency: quote.currencyCode,
      price: Number(quote.price),
      previousClose: toNumber(quote.previousClose),
      change: toNumber(quote.change),
      percentChange: toNumber(quote.percentChange),
      marketStatus: quote.marketStatus,
      provider: quote.provider,
      providerTimestamp: quote.providerTimestamp?.toISOString() ?? null,
      fetchedAt: quote.fetchedAt.toISOString(),
      isDelayed: quote.isDelayed,
      delayMinutes: quote.delayMinutes,
      stale,
    };
  }

  private normalizeHistory(values: MarketPrice[], stale = false) {
    return values.map((value) => ({
      assetId: value.assetId,
      priceDatetime: value.priceDatetime.toISOString(),
      interval: value.interval,
      provider: value.provider,
      open: Number(value.openPrice),
      high: Number(value.highPrice),
      low: Number(value.lowPrice),
      close: Number(value.closePrice),
      volume: toNumber(value.volume),
      currency: value.currencyCode,
      fetchedAt: value.fetchedAt.toISOString(),
      stale,
    }));
  }

  private hasCoverage(values: MarketPrice[], from: Date, to: Date) {
    if (!values.length) return false;
    const tolerance = 3 * 86_400_000;
    const first = values[0]!.priceDatetime.getTime();
    const last = values.at(-1)!.priceDatetime.getTime();
    const effectiveTo = Math.min(to.getTime(), Date.now());
    return first <= from.getTime() + tolerance && last >= effectiveTo - tolerance;
  }

  private toHttpError(error: unknown) {
    if (error instanceof MarketDataError) return error;
    if (error instanceof MarketDataProviderError) {
      const status = error.code === 'SYMBOL_NOT_FOUND' ? 404 : error.code === 'RATE_LIMIT_EXCEEDED' ? 429 : error.code === 'INVALID_PROVIDER_KEY' || error.code === 'PROVIDER_NOT_CONFIGURED' ? 503 : 502;
      return new MarketDataError(status, error.message, error.code);
    }
    return new MarketDataError(502, 'No pudimos consultar el proveedor de precios.', 'PROVIDER_UNAVAILABLE');
  }
}

export const marketDataService = new MarketDataService();
