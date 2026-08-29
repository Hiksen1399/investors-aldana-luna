import type { Request, Response } from 'express';
import { assetIdParamsSchema, historyQuerySchema, portfolioIdParamsSchema, quotesQuerySchema } from './market-data.schemas.js';
import { marketDataService, type MarketDataService } from './market-data.service.js';
import { portfolioValuationService, type PortfolioValuationService } from './services/portfolio-valuation.service.js';

export class MarketDataController {
  constructor(
    private readonly marketData: MarketDataService = marketDataService,
    private readonly valuation: PortfolioValuationService = portfolioValuationService,
  ) {}

  quote = async (req: Request, res: Response) => {
    const { assetId } = assetIdParamsSchema.parse(req.params);
    res.json({ data: await this.marketData.getQuote(req.auth!.userId, assetId) });
  };

  quotes = async (req: Request, res: Response) => {
    const { assetIds } = quotesQuerySchema.parse(req.query);
    res.json({ data: await this.marketData.getQuotes(req.auth!.userId, assetIds) });
  };

  history = async (req: Request, res: Response) => {
    const { assetId } = assetIdParamsSchema.parse(req.params);
    const query = historyQuerySchema.parse(req.query);
    res.json({ data: await this.marketData.getHistoricalPrices(req.auth!.userId, assetId, query.interval, query.from, query.to) });
  };

  liveSummary = async (req: Request, res: Response) => {
    const { portfolioId } = portfolioIdParamsSchema.parse(req.params);
    res.json({ data: await this.valuation.valuePortfolio(req.auth!.userId, portfolioId) });
  };

  livePositions = async (req: Request, res: Response) => {
    const { portfolioId } = portfolioIdParamsSchema.parse(req.params);
    const summary = await this.valuation.valuePortfolio(req.auth!.userId, portfolioId);
    res.json({ data: { portfolioId, baseCurrency: summary.baseCurrency, updatedAt: summary.updatedAt, stale: summary.stale, positions: summary.positions } });
  };
}

export const marketDataController = new MarketDataController();

