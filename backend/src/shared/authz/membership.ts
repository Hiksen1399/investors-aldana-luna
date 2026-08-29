import { prisma } from '../database/prisma.js';
import { HttpError } from '../errors/http-error.js';

export async function requirePortfolioAccess(userId: string, portfolioId: string, write = false) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspace: { portfolios: { some: { id: portfolioId } } } },
    include: { workspace: true },
  });
  if (!membership) throw new HttpError(404, 'No encontramos ese portafolio.', 'PORTFOLIO_NOT_FOUND');
  if (write && membership.role === 'VIEWER') throw new HttpError(403, 'No tienes permiso para modificar este portafolio.', 'FORBIDDEN');
  return membership;
}

export async function requireAccountAccess(userId: string, accountId: string, write = false) {
  const account = await prisma.brokerAccount.findFirst({
    where: { id: accountId, portfolio: { workspace: { members: { some: { userId } } } } },
    include: { portfolio: true, broker: true },
  });
  if (!account) throw new HttpError(404, 'No encontramos esa cuenta.', 'ACCOUNT_NOT_FOUND');
  if (write) await requirePortfolioAccess(userId, account.portfolioId, true);
  return account;
}
