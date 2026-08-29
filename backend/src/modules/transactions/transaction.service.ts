import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../../shared/database/prisma.js';
import { requireAccountAccess } from '../../shared/authz/membership.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { rebuildLots } from './lot.service.js';

type TransactionInput = {
  accountId: string;
  assetId?: string;
  asset?: { ticker: string; name: string; type: 'STOCK' | 'ETF' | 'FUND' | 'BOND' | 'CRYPTO' | 'FOREX' | 'COMMODITY' | 'CASH' | 'OTHER'; exchange?: string; sector?: string; providerSymbol?: string };
  type: 'TRADE' | 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | 'INTEREST' | 'FEE' | 'TAX' | 'CURRENCY_CONVERSION' | 'TRANSFER' | 'SPLIT' | 'ADJUSTMENT';
  side?: 'BUY' | 'SELL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  tradeAt: string;
  quantity?: string;
  unitPrice?: string;
  grossAmount?: string;
  fees: string;
  taxes: string;
  exchangeRate: string;
  currencyCode: string;
  externalId?: string;
  notes?: string;
  source?: 'MANUAL' | 'HAPI_EMAIL' | 'XTB_DOCUMENT' | 'OUTLOOK' | 'FILE' | 'API';
  importRowId?: string;
};

async function resolveAssetId(tx: Prisma.TransactionClient, input: TransactionInput) {
  if (input.assetId) return input.assetId;
  if (!input.asset) return undefined;
  const { providerSymbol: explicitProviderSymbol, ...assetData } = input.asset;
  const providerSymbol = explicitProviderSymbol ?? input.asset.ticker;
  const existing = await tx.asset.findFirst({ where: { ticker: input.asset.ticker, currencyCode: input.currencyCode, exchange: input.asset.exchange ?? null } });
  if (existing) {
    await tx.assetProviderSymbol.upsert({
      where: { provider_providerSymbol: { provider: 'twelve-data', providerSymbol } },
      update: { assetId: existing.id, exchangeCode: input.asset.exchange, active: true },
      create: { assetId: existing.id, provider: 'twelve-data', providerSymbol, exchangeCode: input.asset.exchange },
    });
    return existing.id;
  }
  const created = await tx.asset.create({
    data: {
      ...assetData,
      currencyCode: input.currencyCode,
      providerSymbols: { create: { provider: 'twelve-data', providerSymbol, exchangeCode: input.asset.exchange } },
    },
  });
  return created.id;
}

export const transactionService = {
  async list(userId: string, filters: { portfolioId?: string; accountId?: string; type?: string; ticker?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
    const where: Prisma.TransactionWhereInput = {
      account: {
        ...(filters.accountId ? { id: filters.accountId } : {}),
        ...(filters.portfolioId ? { portfolioId: filters.portfolioId } : {}),
        portfolio: { workspace: { members: { some: { userId, acceptedAt: { not: null } } } } },
      },
      ...(filters.type ? { type: filters.type as Prisma.EnumTransactionTypeFilter['equals'] } : {}),
      ...(filters.ticker ? { asset: { ticker: { contains: filters.ticker, mode: 'insensitive' } } } : {}),
      ...((filters.from || filters.to) ? { tradeAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } } : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.transaction.findMany({ where, include: { asset: true, account: { include: { broker: true, portfolio: { select: { id: true, name: true } } } } }, orderBy: [{ tradeAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.transaction.count({ where }),
    ]);
    return { data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  },

  async get(userId: string, id: string) {
    const transaction = await prisma.transaction.findUnique({ where: { id }, include: { asset: true, account: { include: { broker: true, portfolio: true } }, saleAllocations: true, purchaseLot: true } });
    if (!transaction) throw new HttpError(404, 'No encontramos esa operación.', 'TRANSACTION_NOT_FOUND');
    await requireAccountAccess(userId, transaction.accountId);
    return transaction;
  },

  async create(userId: string, input: TransactionInput) {
    await requireAccountAccess(userId, input.accountId, true);
    return prisma.$transaction(async (tx) => {
      const assetId = await resolveAssetId(tx, input);
      const grossAmount = input.grossAmount ?? new Decimal(input.quantity ?? 0).mul(input.unitPrice ?? 0).toString();
      const created = await tx.transaction.create({
        data: {
          accountId: input.accountId,
          assetId,
          type: input.type,
          side: input.side,
          status: input.status,
          source: input.source ?? 'MANUAL',
          importRowId: input.importRowId,
          tradeAt: new Date(input.tradeAt),
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          grossAmount,
          fees: input.fees,
          taxes: input.taxes,
          exchangeRate: input.exchangeRate,
          currencyCode: input.currencyCode,
          externalId: input.externalId,
          notes: input.notes,
        },
        include: { asset: true, account: { include: { broker: true } } },
      });
      if (assetId && input.type === 'TRADE') await rebuildLots(tx, input.accountId, assetId);
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'TRANSACTION_CREATE', entityType: 'transaction', entityId: created.id } });
      return created;
    });
  },

  async update(userId: string, id: string, input: { status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED'; tradeAt?: string; quantity?: string; unitPrice?: string; grossAmount?: string; fees?: string; taxes?: string; notes?: string | null }) {
    const current = await prisma.transaction.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, 'No encontramos esa operación.', 'TRANSACTION_NOT_FOUND');
    await requireAccountAccess(userId, current.accountId, true);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({ where: { id }, data: { ...input, tradeAt: input.tradeAt ? new Date(input.tradeAt) : undefined }, include: { asset: true, account: { include: { broker: true } } } });
      if (current.assetId && current.type === 'TRADE') await rebuildLots(tx, current.accountId, current.assetId);
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'TRANSACTION_UPDATE', entityType: 'transaction', entityId: id } });
      return updated;
    });
  },

  async remove(userId: string, id: string) {
    const current = await prisma.transaction.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, 'No encontramos esa operación.', 'TRANSACTION_NOT_FOUND');
    await requireAccountAccess(userId, current.accountId, true);
    await prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id } });
      if (current.assetId && current.type === 'TRADE') await rebuildLots(tx, current.accountId, current.assetId);
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'TRANSACTION_DELETE', entityType: 'transaction', entityId: id } });
    });
  },
};
