import axios, { AxiosError, type AxiosInstance } from 'axios';
import { env } from '../../../shared/config/env.js';
import { MarketDataProviderError } from '../market-data.errors.js';
import { twelveDataErrorSchema, twelveDataQuoteSchema, twelveDataSymbolSearchSchema, twelveDataTimeSeriesSchema } from '../market-data.schemas.js';
import type { HistoricalMarketPrice, MarketQuote, MarketSymbolSearchResult } from '../market-data.types.js';
import type { MarketDataProvider } from './market-data-provider.interface.js';

const REQUEST_TIMEOUT_MS = 8_000;

function providerTimestamp(timestamp?: string | number | null, datetime?: string | null): Date | null {
  if (timestamp != null && Number.isFinite(Number(timestamp))) return new Date(Number(timestamp) * 1_000);
  if (!datetime) return null;
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(datetime) ? datetime : `${datetime.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function historicalTimestamp(datetime: string): Date {
  const normalized = datetime.includes('T') || datetime.includes(' ') ? datetime.replace(' ', 'T') : `${datetime}T00:00:00`;
  return new Date(`${normalized.replace(/Z$/, '')}Z`);
}

export class TwelveDataProvider implements MarketDataProvider {
  readonly name = 'TWELVE_DATA';
  private readonly client: AxiosInstance;

  constructor(client?: AxiosInstance, private readonly apiKey = env.TWELVE_DATA_API_KEY) {
    this.client = client ?? axios.create({ baseURL: env.TWELVE_DATA_BASE_URL, timeout: REQUEST_TIMEOUT_MS });
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const data = await this.request('/quote', { symbol });
    const parsed = twelveDataQuoteSchema.safeParse(data);
    if (!parsed.success) throw new MarketDataProviderError('INCOMPLETE_PROVIDER_RESPONSE', 'El proveedor devolvió una cotización incompleta.', false);
    const value = parsed.data;
    const fetchedAt = new Date();
    return {
      symbol: value.symbol,
      name: value.name,
      exchange: value.exchange ?? null,
      currency: value.currency,
      price: value.close,
      openPrice: value.open,
      highPrice: value.high,
      lowPrice: value.low,
      previousClose: value.previous_close,
      change: value.change,
      percentChange: value.percent_change,
      marketStatus: value.is_market_open == null ? 'UNKNOWN' : value.is_market_open ? 'OPEN' : 'CLOSED',
      provider: this.name,
      providerTimestamp: providerTimestamp(value.timestamp, value.datetime),
      fetchedAt,
      isDelayed: false,
      delayMinutes: 0,
      rawResponse: data as Record<string, unknown>,
    };
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    return Promise.all([...new Set(symbols)].map((symbol) => this.getQuote(symbol)));
  }

  async searchSymbols(query: string, outputSize = 20): Promise<MarketSymbolSearchResult[]> {
    const data = await this.request('/symbol_search', { symbol: query, outputsize: String(Math.min(Math.max(outputSize, 1), 120)) });
    const parsed = twelveDataSymbolSearchSchema.safeParse(data);
    if (!parsed.success) throw new MarketDataProviderError('INCOMPLETE_PROVIDER_RESPONSE', 'El proveedor devolvió una búsqueda de activos incompleta.', false);
    return parsed.data.data.map((item) => ({
      symbol: item.symbol,
      name: item.instrument_name,
      exchange: item.exchange ?? null,
      micCode: item.mic_code ?? null,
      country: item.country ?? null,
      currency: item.currency,
      instrumentType: item.instrument_type,
    }));
  }

  async getHistoricalPrices(params: { symbol: string; interval: string; startDate: Date; endDate: Date }): Promise<HistoricalMarketPrice[]> {
    const data = await this.request('/time_series', {
      symbol: params.symbol,
      interval: params.interval,
      start_date: params.startDate.toISOString().slice(0, 10),
      end_date: params.endDate.toISOString().slice(0, 10),
      order: 'ASC',
    });
    const parsed = twelveDataTimeSeriesSchema.safeParse(data);
    if (!parsed.success) throw new MarketDataProviderError('INCOMPLETE_PROVIDER_RESPONSE', 'El proveedor devolvió un historial incompleto.', false);
    const fetchedAt = new Date();
    return parsed.data.values.map((value) => ({
      symbol: parsed.data.meta.symbol,
      priceDatetime: historicalTimestamp(value.datetime),
      interval: parsed.data.meta.interval,
      provider: this.name,
      openPrice: value.open,
      highPrice: value.high,
      lowPrice: value.low,
      closePrice: value.close,
      volume: value.volume,
      currency: parsed.data.meta.currency,
      fetchedAt,
    }));
  }

  private async request(path: string, params: Record<string, string>): Promise<unknown> {
    if (!this.apiKey) throw new MarketDataProviderError('PROVIDER_NOT_CONFIGURED', 'El proveedor de precios todavía no está configurado.', false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.client.get(path, { params: { ...params, apikey: this.apiKey }, signal: controller.signal });
      const providerError = twelveDataErrorSchema.safeParse(response.data);
      if (providerError.success && providerError.data.status === 'error') this.throwProviderResponse(providerError.data.code, providerError.data.message);
      return response.data;
    } catch (error) {
      if (error instanceof MarketDataProviderError) throw error;
      if (axios.isAxiosError(error)) throw this.fromAxiosError(error);
      throw new MarketDataProviderError('PROVIDER_UNAVAILABLE', 'El proveedor de precios no está disponible temporalmente.', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private throwProviderResponse(code: number | undefined, message: string): never {
    const normalized = message.toLowerCase();
    if (code === 401 || normalized.includes('api key')) throw new MarketDataProviderError('INVALID_PROVIDER_KEY', 'La configuración del proveedor de precios no es válida.', false);
    if (code === 429 || normalized.includes('limit') || normalized.includes('credits')) throw new MarketDataProviderError('RATE_LIMIT_EXCEEDED', 'Se alcanzó temporalmente el límite del proveedor.', true);
    if (code === 404 || normalized.includes('symbol') || normalized.includes('not found')) throw new MarketDataProviderError('SYMBOL_NOT_FOUND', 'El proveedor no encontró el símbolo solicitado.', false);
    throw new MarketDataProviderError('PROVIDER_UNAVAILABLE', 'El proveedor de precios no está disponible temporalmente.', true);
  }

  private fromAxiosError(error: AxiosError): MarketDataProviderError {
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED') return new MarketDataProviderError('MARKET_DATA_TIMEOUT', 'El proveedor tardó demasiado en responder.', true);
    if (error.response?.status === 429) return new MarketDataProviderError('RATE_LIMIT_EXCEEDED', 'Se alcanzó temporalmente el límite del proveedor.', true);
    if (error.response?.status === 401 || error.response?.status === 403) return new MarketDataProviderError('INVALID_PROVIDER_KEY', 'La configuración del proveedor de precios no es válida.', false);
    if (error.response?.status === 404) return new MarketDataProviderError('SYMBOL_NOT_FOUND', 'El proveedor no encontró el símbolo solicitado.', false);
    return new MarketDataProviderError('PROVIDER_UNAVAILABLE', 'El proveedor de precios no está disponible temporalmente.', true);
  }
}
