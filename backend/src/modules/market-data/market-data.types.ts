export type MarketStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface MarketQuote {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  price: string;
  openPrice: string | null;
  highPrice: string | null;
  lowPrice: string | null;
  previousClose: string | null;
  change: string | null;
  percentChange: string | null;
  marketStatus: MarketStatus;
  provider: string;
  providerTimestamp: Date | null;
  fetchedAt: Date;
  isDelayed: boolean;
  delayMinutes: number | null;
  rawResponse?: Record<string, unknown>;
}

export interface HistoricalMarketPrice {
  symbol: string;
  priceDatetime: Date;
  interval: string;
  provider: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string | null;
  currency: string;
  fetchedAt: Date;
}

export interface MarketSymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  micCode: string | null;
  country: string | null;
  currency: string;
  instrumentType: string;
}

export interface NormalizedMarketQuote {
  assetId: string;
  symbol: string;
  providerSymbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  percentChange: number | null;
  marketStatus: string | null;
  provider: string;
  providerTimestamp: string | null;
  fetchedAt: string;
  isDelayed: boolean;
  delayMinutes: number | null;
  stale: boolean;
}

export interface LivePosition {
  assetId: string;
  symbol: string;
  name: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  originalMarketValue: number;
  remainingCostBasis: number;
  unrealizedGain: number;
  unrealizedReturnPercentage: number;
  realizedGain: number;
  dividends: number;
  currency: string;
  originalCurrency: string;
  exchangeRateToBase: number;
  providerTimestamp: string | null;
  fetchedAt: string;
  stale: boolean;
}

export interface LivePortfolioSummary {
  portfolioId: string;
  baseCurrency: string;
  investedCapital: number;
  marketValue: number;
  cashBalance: number;
  realizedGain: number;
  unrealizedGain: number;
  dividends: number;
  totalReturn: number;
  totalReturnPercentage: number;
  updatedAt: string;
  stale: boolean;
  positions: LivePosition[];
}
