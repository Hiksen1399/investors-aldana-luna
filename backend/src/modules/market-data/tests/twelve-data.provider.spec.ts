import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { MarketDataProviderError } from '../market-data.errors.js';
import { TwelveDataProvider } from '../providers/twelve-data.provider.js';

const client = (value: unknown, rejects = false) => ({ get: rejects ? vi.fn().mockRejectedValue(value) : vi.fn().mockResolvedValue({ data: value }) }) as unknown as AxiosInstance;

describe('TwelveDataProvider', () => {
  it('normaliza una cotización exitosa sin exponer la API key', async () => {
    const http = client({ symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', currency: 'USD', datetime: '2026-07-12 15:30:00', timestamp: 1783870200, open: '192', high: '196', low: '191', close: '195', previous_close: '192.5', change: '2.5', percent_change: '1.30', is_market_open: true });
    const provider = new TwelveDataProvider(http, 'super-secret-key');
    const quote = await provider.getQuote('NVDA');
    expect(quote.price).toBe('195');
    expect(quote.marketStatus).toBe('OPEN');
    expect(quote.providerTimestamp).toBeInstanceOf(Date);
    expect(JSON.stringify(quote)).not.toContain('super-secret-key');
  });

  it('normaliza la búsqueda oficial de símbolos y empresas', async () => {
    const http = client({ status: 'ok', data: [{ symbol: 'NVDA', instrument_name: 'NVIDIA Corporation', exchange: 'NASDAQ', mic_code: 'XNGS', country: 'United States', currency: 'USD', instrument_type: 'Common Stock' }] });
    const provider = new TwelveDataProvider(http, 'super-secret-key');
    await expect(provider.searchSymbols('NVDA')).resolves.toEqual([{ symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', country: 'United States', currency: 'USD', instrumentType: 'Common Stock' }]);
  });

  it.each([
    [401, 'Invalid API key', 'INVALID_PROVIDER_KEY'],
    [404, 'Symbol not found', 'SYMBOL_NOT_FOUND'],
    [429, 'API credits limit exceeded', 'RATE_LIMIT_EXCEEDED'],
  ])('clasifica el error %s del proveedor', async (code, message, expected) => {
    const provider = new TwelveDataProvider(client({ status: 'error', code, message }), 'key');
    await expect(provider.getQuote('UNKNOWN')).rejects.toMatchObject({ code: expected });
  });

  it('convierte un timeout en un error reintentable', async () => {
    const provider = new TwelveDataProvider(client(new AxiosError('timeout', 'ECONNABORTED'), true), 'key');
    await expect(provider.getQuote('NVDA')).rejects.toEqual(expect.objectContaining<Partial<MarketDataProviderError>>({ code: 'MARKET_DATA_TIMEOUT', retryable: true }));
  });

  it('normaliza OHLCV histórico sin confundir su fecha con fetchedAt', async () => {
    const provider = new TwelveDataProvider(client({ meta: { symbol: 'NVDA', interval: '1day', currency: 'USD' }, values: [{ datetime: '2026-07-11', open: '190', high: '196', low: '189', close: '195', volume: '1000' }] }), 'key');
    const [price] = await provider.getHistoricalPrices({ symbol: 'NVDA', interval: '1day', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-12') });
    expect(price?.priceDatetime.toISOString()).toBe('2026-07-11T00:00:00.000Z');
    expect(price?.fetchedAt.getTime()).toBeGreaterThan(price!.priceDatetime.getTime());
  });
});
