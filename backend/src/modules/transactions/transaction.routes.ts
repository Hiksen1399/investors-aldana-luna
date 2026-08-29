import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { createTransactionSchema, updateTransactionSchema } from './transaction.schemas.js';
import { transactionService } from './transaction.service.js';

const router = Router();
router.use(authenticate);
router.get('/', async (req, res) => {
  const result = await transactionService.list(req.auth!.userId, {
    portfolioId: req.query.portfolioId as string | undefined,
    accountId: req.query.accountId as string | undefined,
    type: req.query.type as string | undefined,
    ticker: req.query.ticker as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 25,
  });
  res.json(result);
});
router.post('/', async (req, res) => res.status(201).json({ data: await transactionService.create(req.auth!.userId, createTransactionSchema.parse(req.body)) }));
router.get('/:id', async (req, res) => res.json({ data: await transactionService.get(req.auth!.userId, req.params.id!) }));
router.patch('/:id', async (req, res) => res.json({ data: await transactionService.update(req.auth!.userId, req.params.id!, updateTransactionSchema.parse(req.body)) }));
router.delete('/:id', async (req, res) => { await transactionService.remove(req.auth!.userId, req.params.id!); res.status(204).send(); });

export { router as transactionRouter };
