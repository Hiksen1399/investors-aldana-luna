import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { marketDataController } from './market-data.controller.js';

export const marketDataRouter = Router();
marketDataRouter.use(authenticate);
marketDataRouter.get('/assets/:assetId/quote', marketDataController.quote);
marketDataRouter.get('/quotes', marketDataController.quotes);
marketDataRouter.get('/assets/:assetId/history', marketDataController.history);

export const livePortfolioRouter = Router();
livePortfolioRouter.use(authenticate);
livePortfolioRouter.get('/:portfolioId/live-summary', marketDataController.liveSummary);
livePortfolioRouter.get('/:portfolioId/positions/live', marketDataController.livePositions);

