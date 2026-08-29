import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { createAccountSchema, updateAccountSchema } from './account.schemas.js';
import { accountService } from './account.service.js';

const router = Router();
router.use(authenticate);
router.get('/', async (req, res) => res.json({ data: await accountService.list(req.auth!.userId, req.query.portfolioId as string | undefined) }));
router.post('/', async (req, res) => res.status(201).json({ data: await accountService.create(req.auth!.userId, createAccountSchema.parse(req.body)) }));
router.get('/:id', async (req, res) => res.json({ data: await accountService.get(req.auth!.userId, req.params.id!) }));
router.patch('/:id', async (req, res) => res.json({ data: await accountService.update(req.auth!.userId, req.params.id!, updateAccountSchema.parse(req.body)) }));
router.delete('/:id', async (req, res) => { await accountService.archive(req.auth!.userId, req.params.id!); res.status(204).send(); });

export { router as accountRouter };

