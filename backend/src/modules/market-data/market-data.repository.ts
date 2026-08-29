import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma.js';
import type { HistoricalMarketPrice, MarketQuote } from './market-data.types.js';

export class MarketDataRepository {
  async findAccessibleAsset(userId: string, assetId: string, provider: string) {
    return prisma.asset.findFirst({
      where: {
        id: assetId,
        isActive: true,
        transactions: { some: { status: 'CONFIRMED', account: { archivedAt: null, portfolio: { archivedAt: null, workspace: { members: { some: { userId, acceptedAt: { not: null } } } } } } } },
      },
      include: { providerSymbols: { where: { provider, active: true }, take: 1 } },
    });
  }

  async findMappingBySource(provider: string, providerSymbol: string, targetProvider: string) {
    return prisma.assetProviderSymbol.findUnique({
      where: { provider_providerSymbol: { provider, providerSymbol } },
      include: { asset: { include: { providerSymbols: { where: { provider: targetProvider, active: true }, take: 1 } } } },
    });
  }

  getLatestQuote(assetId: string) {
    return prisma.latestMarketQuote.findUnique({ where: { assetId } });
  }

  upsertLatestQuote(assetId: string, currencyCode: string, quote: MarketQuote) {
    const data: Prisma.LatestMarketQuoteUncheckedCreateInput = {
      assetId,
      price: quote.price,
      currencyCode,
      openPrice: quote.openPrice,
      highPrice: quote.highPrice,
      lowPrice: quote.lowPrice,
      previousClose: quote.previousClose,
      change: quote.change,
      percentChange: quote.percentChange,
      marketStatus: quote.marketStatus,
      provider: quote.provider,
      providerTimestamp: quote.providerTimestamp,
      fetchedAt: quote.fetchedAt,
      isDelayed: quote.isDelayed,
      delayMinutes: quote.delayMinutes,
      rawResponse: quote.rawResponse as Prisma.InputJsonValue | undefined,
    };
    return prisma.latestMarketQuote.upsert({ where: { assetId }, update: data, create: data });
  }

  getHistoricalPrices(assetId: string, interval: string, from: Date, to: Date) {
    return prisma.marketPrice.findMany({
      where: { assetId, interval, priceDatetime: { gte: from, lte: to } },
      orderBy: { priceDatetime: 'asc' },
    });
  }

  async saveHistoricalPrices(assetId: string, currencyCode: string, values: HistoricalMarketPrice[]) {
    if (!values.length) return;
    await prisma.marketPrice.createMany({
      data: values.map((value) => ({
        assetId,
        priceDatetime: value.priceDatetime,
        interval: value.interval,
        provider: value.provider,
        openPrice: value.openPrice,
        highPrice: value.highPrice,
        lowPrice: value.lowPrice,
        closePrice: value.closePrice,
        volume: value.volume,
        currencyCode,
        fetchedAt: value.fetchedAt,
      })),
      skipDuplicates: true,
    });
  }

  getPortfolio(userId: string, portfolioId: string) {
    return prisma.portfolio.findFirst({
      where: { id: portfolioId, archivedAt: null, workspace: { members: { some: { userId, acceptedAt: { not: null } } } } },
    });
  }

  getPortfolioTransactions(portfolioId: string) {
    return prisma.transaction.findMany({
      where: { status: 'CONFIRMED', account: { portfolioId, archivedAt: null } },
      include: { asset: true },
      orderBy: [{ tradeAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  getPortfolioLots(portfolioId: string) {
    return prisma.transactionLot.findMany({
      where: { remainingQuantity: { gt: 0 }, account: { portfolioId, archivedAt: null } },
      include: { asset: true, account: true, purchaseTransaction: true },
      orderBy: { acquiredAt: 'asc' },
    });
  }

  getPortfolioAllocations(portfolioId: string) {
    return prisma.lotAllocation.findMany({
      where: { saleTransaction: { account: { portfolioId } } },
      include: { lot: true, saleTransaction: true },
    });
  }

  getLatestExchangeRate(baseCurrencyCode: string, quoteCurrencyCode: string, source: string) {
    return prisma.exchangeRate.findFirst({ where: { baseCurrencyCode, quoteCurrencyCode, source }, orderBy: { fetchedAt: 'desc' } });
  }

  saveExchangeRate(input: { baseCurrencyCode: string; quoteCurrencyCode: string; rate: string; rateAt: Date; fetchedAt: Date; source: string }) {
    return prisma.exchangeRate.upsert({
      where: { baseCurrencyCode_quoteCurrencyCode_rateAt_source: { baseCurrencyCode: input.baseCurrencyCode, quoteCurrencyCode: input.quoteCurrencyCode, rateAt: input.rateAt, source: input.source } },
      update: { rate: input.rate, fetchedAt: input.fetchedAt },
      create: input,
    });
  }
}

export const marketDataRepository = new MarketDataRepository();
