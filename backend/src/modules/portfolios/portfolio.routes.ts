import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { createPortfolioSchema, updatePortfolioSchema } from './portfolio.schemas.js';
import { portfolioService } from './portfolio.service.js';
import { analyticsService } from '../analytics/analytics.service.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => res.json({ data: await portfolioService.list(req.auth!.userId) }));
router.post('/', async (req, res) => res.status(201).json({ data: await portfolioService.create(req.auth!.userId, createPortfolioSchema.parse(req.body)) }));
router.get('/:id', async (req, res) => res.json({ data: await portfolioService.get(req.auth!.userId, req.params.id!) }));
router.patch('/:id', async (req, res) => res.json({ data: await portfolioService.update(req.auth!.userId, req.params.id!, updatePortfolioSchema.parse(req.body)) }));
router.delete('/:id', async (req, res) => { await portfolioService.archive(req.auth!.userId, req.params.id!); res.status(204).send(); });
router.get('/:id/summary', async (req, res) => res.json({ data: await analyticsService.summary(req.auth!.userId, req.params.id!, req.query.accountId as string | undefined) }));
router.get('/:id/history', async (req, res) => res.json({ data: await analyticsService.history(req.auth!.userId, req.params.id!) }));

export { router as portfolioRouter };

