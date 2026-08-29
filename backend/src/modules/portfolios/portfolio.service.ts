import { prisma } from '../../shared/database/prisma.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { requirePortfolioAccess } from '../../shared/authz/membership.js';

type PortfolioInput = { name: string; description?: string; objective?: string; baseCurrencyCode: string; workspaceId?: string };

export const portfolioService = {
  async list(userId: string) {
    return prisma.portfolio.findMany({
      where: { archivedAt: null, workspace: { members: { some: { userId, acceptedAt: { not: null } } } } },
      include: {
        workspace: { select: { id: true, name: true, type: true, members: { where: { userId }, select: { role: true } } } },
        _count: { select: { accounts: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async get(userId: string, id: string) {
    await requirePortfolioAccess(userId, id);
    return prisma.portfolio.findUnique({
      where: { id },
      include: { workspace: { select: { id: true, name: true, type: true } }, accounts: { where: { archivedAt: null }, include: { broker: true } } },
    });
  },

  async create(userId: string, input: PortfolioInput) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId, acceptedAt: { not: null }, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) },
      orderBy: { invitedAt: 'asc' },
    });
    if (!membership) throw new HttpError(403, 'No tienes un espacio disponible.', 'WORKSPACE_REQUIRED');
    if (membership.role === 'VIEWER') throw new HttpError(403, 'No tienes permiso para crear portafolios.', 'FORBIDDEN');
    return prisma.portfolio.create({ data: { workspaceId: membership.workspaceId, name: input.name, description: input.description, objective: input.objective, baseCurrencyCode: input.baseCurrencyCode } });
  },

  async update(userId: string, id: string, input: Partial<PortfolioInput>) {
    await requirePortfolioAccess(userId, id, true);
    return prisma.portfolio.update({ where: { id }, data: input });
  },

  async archive(userId: string, id: string) {
    await requirePortfolioAccess(userId, id, true);
    return prisma.portfolio.update({ where: { id }, data: { archivedAt: new Date() } });
  },
};

