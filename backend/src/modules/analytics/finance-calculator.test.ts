import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculatePortfolio, type FinancialTransaction } from './finance-calculator.js';

const decimal = (value: number) => ({ toString: () => String(value) });
const asset = { id: 'asset-1', ticker: 'TEST', name: 'Test Inc.', sector: 'Tecnología', type: 'STOCK' };
function tx(overrides: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    id: crypto.randomUUID(), accountId: 'account-1', type: 'TRADE', side: 'BUY', tradeAt: new Date(),
    quantity: decimal(1), unitPrice: decimal(1), grossAmount: decimal(1), fees: decimal(0), taxes: decimal(0), exchangeRate: decimal(1), asset,
    ...overrides,
  };
}

describe('calculatePortfolio', () => {
  it('separa los aportes de la ganancia no realizada', () => {
    const result = calculatePortfolio([
      tx({ type: 'DEPOSIT', side: null, asset: null, quantity: null, unitPrice: null, grossAmount: decimal(1000) }),
      tx({ quantity: decimal(10), unitPrice: decimal(50), grossAmount: decimal(500) }),
    ], new Map([['asset-1', new Decimal(60)]]));
    expect(result.metrics.contributed).toBe(1000);
    expect(result.metrics.currentValue).toBe(1100);
    expect(result.metrics.totalGain).toBe(100);
    expect(result.metrics.unrealizedGain).toBe(100);
  });

  it('calcula ventas con lotes FIFO', () => {
    const result = calculatePortfolio([
      tx({ tradeAt: new Date('2026-01-01'), quantity: decimal(10), unitPrice: decimal(10), grossAmount: decimal(100) }),
      tx({ tradeAt: new Date('2026-02-01'), quantity: decimal(5), unitPrice: decimal(20), grossAmount: decimal(100) }),
      tx({ tradeAt: new Date('2026-03-01'), side: 'SELL', quantity: decimal(12), unitPrice: decimal(30), grossAmount: decimal(360) }),
    ], new Map([['asset-1', new Decimal(30)]]));
    expect(result.metrics.realizedGain).toBe(220);
    expect(result.positions[0]?.quantity).toBe(3);
    expect(result.positions[0]?.averagePrice).toBe(20);
  });
});
