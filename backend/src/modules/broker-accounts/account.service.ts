import { prisma } from '../../shared/database/prisma.js';
import { requireAccountAccess, requirePortfolioAccess } from '../../shared/authz/membership.js';

type AccountInput = {
  portfolioId: string;
  brokerId: string;
  name: string;
  externalAccountNumber?: string;
  objective?: string;
  currencyCode: string;
  autoImportEnabled: boolean;
};

export const accountService = {
  list(userId: string, portfolioId?: string) {
    return prisma.brokerAccount.findMany({
      where: {
        archivedAt: null,
        ...(portfolioId ? { portfolioId } : {}),
        portfolio: { workspace: { members: { some: { userId, acceptedAt: { not: null } } } } },
      },
      include: { broker: true, portfolio: { select: { id: true, name: true, baseCurrencyCode: true } }, _count: { select: { transactions: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async get(userId: string, id: string) {
    await requireAccountAccess(userId, id);
    return prisma.brokerAccount.findUnique({ where: { id }, include: { broker: true, portfolio: true } });
  },

  async create(userId: string, input: AccountInput) {
    await requirePortfolioAccess(userId, input.portfolioId, true);
    return prisma.brokerAccount.create({ data: input, include: { broker: true, portfolio: true } });
  },

  async update(userId: string, id: string, input: Partial<Omit<AccountInput, 'portfolioId' | 'brokerId'>>) {
    await requireAccountAccess(userId, id, true);
    return prisma.brokerAccount.update({ where: { id }, data: input, include: { broker: true, portfolio: true } });
  },

  async archive(userId: string, id: string) {
    await requireAccountAccess(userId, id, true);
    return prisma.brokerAccount.update({ where: { id }, data: { archivedAt: new Date() } });
  },
};

