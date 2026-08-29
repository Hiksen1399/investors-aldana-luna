import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { prisma } from '../../shared/database/prisma.js';

const router = Router();
router.use(authenticate);
router.get('/brokers', async (_req, res) => res.json({ data: await prisma.broker.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }) }));
router.get('/currencies', async (_req, res) => res.json({ data: await prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }) }));
router.get('/assets', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  res.json({ data: await prisma.asset.findMany({
    where: { isActive: true, ...(search ? { OR: [{ ticker: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}) },
    take: 50,
    orderBy: { ticker: 'asc' },
  }) });
});

export { router as referenceRouter };
