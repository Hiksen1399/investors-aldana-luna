import { Decimal } from 'decimal.js';
import { MarketDataError } from '../market-data.errors.js';
import { marketDataRepository, type MarketDataRepository } from '../market-data.repository.js';
import { marketDataService, type MarketDataService } from '../market-data.service.js';
import type { LivePortfolioSummary, LivePosition, NormalizedMarketQuote } from '../market-data.types.js';

type LotRow = Awaited<ReturnType<MarketDataRepository['getPortfolioLots']>>[number];
type AllocationRow = Awaited<ReturnType<MarketDataRepository['getPortfolioAllocations']>>[number];
type TransactionRow = Awaited<ReturnType<MarketDataRepository['getPortfolioTransactions']>>[number];

const d = (value: { toString(): string } | string | number | null | undefined) => new Decimal(value?.toString() ?? 0);
const n = (value: Decimal) => Number(value.toDecimalPlaces(6).toString());

export async function calculateLivePositions(input: {
  baseCurrency: string;
  lots: LotRow[];
  allocations: AllocationRow[];
  transactions: TransactionRow[];
  quotes: NormalizedMarketQuote[];
  exchangeRate: (from: string, to: string) => Promise<{ rate: number; stale: boolean }>;
}): Promise<LivePosition[]> {
  const quotes = new Map(input.quotes.map((quote) => [quote.assetId, quote]));
  const grouped = new Map<string, LotRow[]>();
  for (const lot of input.lots) grouped.set(lot.assetId, [...(grouped.get(lot.assetId) ?? []), lot]);
  const positions: LivePosition[] = [];

  for (const [assetId, lots] of grouped) {
    const quote = quotes.get(assetId);
    if (!quote) continue;
    const asset = lots[0]!.asset;
    const quantity = lots.reduce((sum, lot) => sum.plus(lot.remainingQuantity.toString()), new Decimal(0));
    if (quantity.lte(0)) continue;
    const remainingCostBasis = lots.reduce((sum, lot) => {
      const executionRate = d(lot.purchaseTransaction.exchangeRate || 1);
      return sum.plus(d(lot.remainingQuantity).mul(lot.unitCost.toString()).mul(executionRate));
    }, new Decimal(0));
    const fx = await input.exchangeRate(quote.currency, input.baseCurrency);
    const currentPrice = d(quote.price).mul(fx.rate);
    const originalMarketValue = d(quote.price).mul(quantity);
    const marketValue = currentPrice.mul(quantity);
    const unrealizedGain = marketValue.minus(remainingCostBasis);
    const realizedGain = input.allocations.filter((allocation) => allocation.lot.assetId === assetId).reduce((sum, allocation) => sum.plus(d(allocation.realizedGain).mul(allocation.saleTransaction.exchangeRate.toString())), new Decimal(0));
    const dividends = input.transactions.filter((transaction) => transaction.assetId === assetId && transaction.type === 'DIVIDEND').reduce((sum, transaction) => sum.plus(d(transaction.grossAmount).minus(transaction.fees).minus(transaction.taxes).mul(transaction.exchangeRate.toString())), new Decimal(0));

    positions.push({
      assetId,
      symbol: asset.ticker,
      name: asset.name,
      quantity: n(quantity),
      averageCost: n(remainingCostBasis.div(quantity)),
      currentPrice: n(currentPrice),
      marketValue: n(marketValue),
      originalMarketValue: n(originalMarketValue),
      remainingCostBasis: n(remainingCostBasis),
      unrealizedGain: n(unrealizedGain),
      unrealizedReturnPercentage: remainingCostBasis.eq(0) ? 0 : n(unrealizedGain.div(remainingCostBasis).mul(100)),
      realizedGain: n(realizedGain),
      dividends: n(dividends),
      currency: input.baseCurrency,
      originalCurrency: quote.currency,
      exchangeRateToBase: fx.rate,
      providerTimestamp: quote.providerTimestamp,
      fetchedAt: quote.fetchedAt,
      stale: quote.stale || fx.stale,
    });
  }
  return positions.sort((a, b) => b.marketValue - a.marketValue);
}

export class PortfolioValuationService {
  constructor(
    private readonly repository: MarketDataRepository = marketDataRepository,
    private readonly prices: MarketDataService = marketDataService,
  ) {}

  async valuePortfolio(userId: string, portfolioId: string): Promise<LivePortfolioSummary> {
    const portfolio = await this.repository.getPortfolio(userId, portfolioId);
    if (!portfolio) throw new MarketDataError(404, 'No encontramos ese portafolio.', 'PORTFOLIO_NOT_FOUND');
    const [transactions, lots, allocations] = await Promise.all([
      this.repository.getPortfolioTransactions(portfolioId),
      this.repository.getPortfolioLots(portfolioId),
      this.repository.getPortfolioAllocations(portfolioId),
    ]);
    const assetIds = [...new Set(lots.map((lot) => lot.assetId))];
    const quotes = assetIds.length ? await this.prices.getQuotes(userId, assetIds) : [];
    const exchangeCache = new Map<string, { rate: number; stale: boolean }>();
    const exchangeRate = async (from: string, to: string) => {
      const key = `${from}/${to}`;
      const existing = exchangeCache.get(key);
      if (existing) return existing;
      const rate = await this.prices.getExchangeRate(from, to);
      const normalized = { rate: rate.rate, stale: rate.stale };
      exchangeCache.set(key, normalized);
      return normalized;
    };
    const positions = await calculateLivePositions({ baseCurrency: portfolio.baseCurrencyCode, lots, allocations, transactions, quotes, exchangeRate });

    let deposits = new Decimal(0);
    let withdrawals = new Decimal(0);
    let cash = new Decimal(0);
    let explicitCosts = new Decimal(0);
    let interest = new Decimal(0);
    for (const transaction of transactions) {
      const rate = d(transaction.exchangeRate || 1);
      const gross = d(transaction.grossAmount).mul(rate);
      const costs = d(transaction.fees).plus(transaction.taxes).mul(rate);
      if (transaction.type === 'DEPOSIT') { deposits = deposits.plus(gross); cash = cash.plus(gross); }
      if (transaction.type === 'WITHDRAWAL') { withdrawals = withdrawals.plus(gross); cash = cash.minus(gross); }
      if (transaction.type === 'TRADE' && transaction.side === 'BUY') cash = cash.minus(gross).minus(costs);
      if (transaction.type === 'TRADE' && transaction.side === 'SELL') cash = cash.plus(gross).minus(costs);
      if (transaction.type === 'DIVIDEND') cash = cash.plus(gross).minus(costs);
      if (transaction.type === 'INTEREST') { interest = interest.plus(gross.minus(costs)); cash = cash.plus(gross).minus(costs); }
      if (transaction.type === 'FEE' || transaction.type === 'TAX') { explicitCosts = explicitCosts.plus(gross); cash = cash.minus(gross); }
    }
    const marketValue = positions.reduce((sum, position) => sum.plus(position.marketValue), new Decimal(0));
    const realizedGain = positions.reduce((sum, position) => sum.plus(position.realizedGain), new Decimal(0));
    const unrealizedGain = positions.reduce((sum, position) => sum.plus(position.unrealizedGain), new Decimal(0));
    const dividends = positions.reduce((sum, position) => sum.plus(position.dividends), new Decimal(0));
    const totalReturn = realizedGain.plus(unrealizedGain).plus(dividends).plus(interest).minus(explicitCosts);
    const investedCapital = deposits.minus(withdrawals);
    const updatedAt = quotes.reduce((latest, quote) => quote.fetchedAt > latest ? quote.fetchedAt : latest, new Date(0).toISOString());
    return {
      portfolioId,
      baseCurrency: portfolio.baseCurrencyCode,
      investedCapital: n(investedCapital),
      marketValue: n(marketValue),
      cashBalance: n(cash),
      realizedGain: n(realizedGain),
      unrealizedGain: n(unrealizedGain),
      dividends: n(dividends),
      totalReturn: n(totalReturn),
      totalReturnPercentage: investedCapital.eq(0) ? 0 : n(totalReturn.div(investedCapital).mul(100)),
      updatedAt: updatedAt === new Date(0).toISOString() ? new Date().toISOString() : updatedAt,
      stale: positions.some((position) => position.stale),
      positions,
    };
  }
}

export const portfolioValuationService = new PortfolioValuationService();

