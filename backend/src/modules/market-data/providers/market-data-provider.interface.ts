import type { HistoricalMarketPrice, MarketQuote, MarketSymbolSearchResult } from '../market-data.types.js';

export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<MarketQuote>;
  getQuotes(symbols: string[]): Promise<MarketQuote[]>;
  searchSymbols(query: string, outputSize?: number): Promise<MarketSymbolSearchResult[]>;
  getHistoricalPrices(params: { symbol: string; interval: string; startDate: Date; endDate: Date }): Promise<HistoricalMarketPrice[]>;
}
