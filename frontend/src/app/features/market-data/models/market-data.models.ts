export interface MarketQuote {
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

export interface HistoricalMarketPrice {
  assetId: string;
  priceDatetime: string;
  interval: string;
  provider: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  currency: string;
  fetchedAt: string;
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

