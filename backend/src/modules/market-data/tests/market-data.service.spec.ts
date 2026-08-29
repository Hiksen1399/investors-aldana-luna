import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it, vi } from 'vitest';
import { MarketDataService } from '../market-data.service.js';
import { QuoteCacheService } from '../services/quote-cache.service.js';
import { SymbolMapperService } from '../services/symbol-mapper.service.js';

const asset = { id: 'asset-1', ticker: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', currencyCode: 'USD', providerSymbols: [{ providerSymbol: 'NVDA' }] };
const cached = { assetId: 'asset-1', price: new Decimal(195), currencyCode: 'USD', openPrice: null, highPrice: null, lowPrice: null, previousClose: new Decimal(192.5), change: new Decimal(2.5), percentChange: new Decimal(1.3), marketStatus: 'OPEN', provider: 'TWELVE_DATA', providerTimestamp: new Date('2026-07-12T15:30:00Z'), fetchedAt: new Date(), isDelayed: false, delayMinutes: 0, rawResponse: null };

function setup(options: { fresh: boolean; providerFails?: boolean }) {
  const repository = {
    findAccessibleAsset: vi.fn().mockResolvedValue(asset),
    getLatestQuote: vi.fn().mockResolvedValue(cached),
    upsertLatestQuote: vi.fn(),
  };
  const provider = {
    name: 'TWELVE_DATA',
    getQuote: options.providerFails ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn(),
    getQuotes: vi.fn(), getHistoricalPrices: vi.fn(),
  };
  const cache = { isFresh: vi.fn().mockReturnValue(options.fresh) };
  const mapper = { resolveAccessibleAsset: vi.fn().mockResolvedValue({ asset, mapping: { providerSymbol: 'NVDA' } }) };
  const service = new MarketDataService(repository as never, provider, cache as never, mapper as never);
  return { service, provider, repository };
}

describe('MarketDataService cache', () => {
  it('reutiliza el precio cuando el caché está vigente', async () => {
    const { service, provider } = setup({ fresh: true });
    const quote = await service.getQuote('user-1', 'asset-1');
    expect(quote.price).toBe(195);
    expect(quote.stale).toBe(false);
    expect(provider.getQuote).not.toHaveBeenCalled();
  });

  it('devuelve el último precio con stale cuando el proveedor falla', async () => {
    const { service } = setup({ fresh: false, providerFails: true });
    const quote = await service.getQuote('user-1', 'asset-1');
    expect(quote.price).toBe(195);
    expect(quote.stale).toBe(true);
  });

  it('distingue caché abierto, cerrado y vencido', () => {
    const cacheService = new QuoteCacheService(60, 900);
    const now = new Date('2026-07-12T15:30:00Z');
    expect(cacheService.isFresh({ marketStatus: 'OPEN', fetchedAt: new Date(now.getTime() - 59_000) }, now)).toBe(true);
    expect(cacheService.isFresh({ marketStatus: 'OPEN', fetchedAt: new Date(now.getTime() - 61_000) }, now)).toBe(false);
    expect(cacheService.isFresh({ marketStatus: 'CLOSED', fetchedAt: new Date(now.getTime() - 899_000) }, now)).toBe(true);
  });
});

describe('SymbolMapperService', () => {
  it('normaliza NVDA.US mediante la tabla de mapeo', async () => {
    const repository = { findMappingBySource: vi.fn().mockResolvedValue({ assetId: 'asset-1', asset: { ticker: 'NVDA', providerSymbols: [{ providerSymbol: 'NVDA' }] } }) };
    const mapper = new SymbolMapperService(repository as never);
    await expect(mapper.mapProviderSymbol('xtb', 'NVDA.US')).resolves.toEqual({ assetId: 'asset-1', symbol: 'NVDA', providerSymbol: 'NVDA' });
    expect(repository.findMappingBySource).toHaveBeenCalledWith('xtb', 'NVDA.US', 'twelve-data');
  });
});

