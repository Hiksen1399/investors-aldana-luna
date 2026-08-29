import { Decimal } from 'decimal.js';
import { prisma } from '../../shared/database/prisma.js';
import { requirePortfolioAccess } from '../../shared/authz/membership.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { calculatePortfolio, type FinancialTransaction } from './finance-calculator.js';

export const analyticsService = {
  async summary(userId: string, portfolioId: string, accountId?: string) {
    await requirePortfolioAccess(userId, portfolioId);
    if (accountId) {
      const belongs = await prisma.brokerAccount.count({ where: { id: accountId, portfolioId } });
      if (!belongs) throw new HttpError(404, 'La cuenta no pertenece a este portafolio.', 'ACCOUNT_NOT_FOUND');
    }
    const portfolio = await prisma.portfolio.findUniqueOrThrow({ where: { id: portfolioId } });
    const transactions = await prisma.transaction.findMany({
      where: { status: 'CONFIRMED', account: { portfolioId, ...(accountId ? { id: accountId } : {}) } },
      include: { asset: true },
      orderBy: { tradeAt: 'asc' },
    });
    const assetIds = [...new Set(transactions.flatMap((item) => item.assetId ? [item.assetId] : []))];
    const prices = await prisma.marketPrice.findMany({ where: { assetId: { in: assetIds } }, orderBy: { priceDatetime: 'desc' }, distinct: ['assetId'] });
    const marketPrices = new Map(prices.map((item) => [item.assetId, new Decimal(item.closePrice.toString())]));
    const result = calculatePortfolio(transactions as FinancialTransaction[], marketPrices);

    const accounts = await prisma.brokerAccount.findMany({ where: { portfolioId, archivedAt: null }, include: { broker: true } });
    const accountPerformance = accounts.map((account) => {
      const accountTransactions = transactions.filter((item) => item.accountId === account.id);
      const calculated = calculatePortfolio(accountTransactions as FinancialTransaction[], marketPrices);
      return { id: account.id, name: account.name, broker: account.broker.name, value: calculated.metrics.currentValue, gain: calculated.metrics.totalGain, returnPercent: calculated.metrics.returnPercent };
    });

    const allocationByBroker = accountPerformance.reduce<Array<{ name: string; value: number }>>((items, account) => {
      const existing = items.find((item) => item.name === account.broker);
      if (existing) existing.value += Math.max(account.value, 0);
      else items.push({ name: account.broker, value: Math.max(account.value, 0) });
      return items;
    }, []);

    return { portfolio: { id: portfolio.id, name: portfolio.name, currency: portfolio.baseCurrencyCode }, ...result, accounts: accountPerformance, allocationByBroker, updatedAt: new Date() };
  },

  async history(userId: string, portfolioId: string) {
    await requirePortfolioAccess(userId, portfolioId);
    const snapshots = await prisma.portfolioSnapshot.findMany({ where: { portfolioId }, orderBy: { snapshotAt: 'asc' } });
    return snapshots.map((snapshot) => ({
      date: snapshot.snapshotAt,
      contributed: Number(snapshot.contributed),
      portfolioValue: Number(snapshot.marketValue) + Number(snapshot.cashBalance),
      marketValue: Number(snapshot.marketValue),
      cashBalance: Number(snapshot.cashBalance),
    }));
  },
};
