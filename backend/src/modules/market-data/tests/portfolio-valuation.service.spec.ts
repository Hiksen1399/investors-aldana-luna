import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it, vi } from 'vitest';
import { calculateLivePositions, PortfolioValuationService } from '../services/portfolio-valuation.service.js';

const decimal = (value: string | number) => new Decimal(value);
const quote = (price: number) => ({ assetId: 'asset-1', symbol: 'NVDA', providerSymbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', currency: 'USD', price, previousClose: null, change: null, percentChange: null, marketStatus: 'OPEN', provider: 'TWELVE_DATA', providerTimestamp: '2026-07-12T15:30:00Z', fetchedAt: '2026-07-12T15:30:05Z', isDelayed: false, delayMinutes: 0, stale: false });
const lot = (quantity: number, unitCost: number) => ({ assetId: 'asset-1', remainingQuantity: decimal(quantity), unitCost: decimal(unitCost), asset: { id: 'asset-1', ticker: 'NVDA', name: 'NVIDIA', currencyCode: 'USD' }, purchaseTransaction: { exchangeRate: decimal(1) } });

describe('calculateLivePositions', () => {
  it('calcula ganancia positiva con acciones fraccionadas', async () => {
    const [position] = await calculateLivePositions({ baseCurrency: 'USD', lots: [lot(.081, 189.075)] as never, allocations: [], transactions: [], quotes: [quote(195)], exchangeRate: async () => ({ rate: 1, stale: false }) });
    expect(position?.quantity).toBe(.081);
    expect(position?.unrealizedGain).toBeCloseTo(.48, 2);
    expect(position?.unrealizedReturnPercentage).toBeCloseTo(3.13, 2);
  });

  it('calcula una pérdida sin convertir depósitos en rendimiento', async () => {
    const [position] = await calculateLivePositions({ baseCurrency: 'USD', lots: [lot(2, 200)] as never, allocations: [], transactions: [{ type: 'DEPOSIT', grossAmount: decimal(10_000) }] as never, quotes: [quote(180)], exchangeRate: async () => ({ rate: 1, stale: false }) });
    expect(position?.unrealizedGain).toBe(-40);
    expect(position?.unrealizedReturnPercentage).toBe(-10);
  });

  it('convierte USD a COP conservando el valor original', async () => {
    const [position] = await calculateLivePositions({ baseCurrency: 'COP', lots: [lot(1, 190)] as never, allocations: [], transactions: [], quotes: [quote(200)], exchangeRate: async () => ({ rate: 4_000, stale: false }) });
    expect(position?.originalMarketValue).toBe(200);
    expect(position?.marketValue).toBe(800_000);
    expect(position?.originalCurrency).toBe('USD');
    expect(position?.currency).toBe('COP');
  });
});

describe('PortfolioValuationService authorization', () => {
  it('rechaza un usuario sin acceso al portafolio', async () => {
    const repository = { getPortfolio: vi.fn().mockResolvedValue(null) };
    const service = new PortfolioValuationService(repository as never, {} as never);
    await expect(service.valuePortfolio('user-1', 'portfolio-1')).rejects.toMatchObject({ statusCode: 404, code: 'PORTFOLIO_NOT_FOUND' });
  });
});
