import { Decimal } from 'decimal.js';

export type FinancialTransaction = {
  id: string;
  accountId: string;
  type: string;
  side: string | null;
  tradeAt: Date;
  quantity: { toString(): string } | null;
  unitPrice: { toString(): string } | null;
  grossAmount: { toString(): string };
  fees: { toString(): string };
  taxes: { toString(): string };
  exchangeRate: { toString(): string };
  asset: null | { id: string; ticker: string; name: string; sector: string | null; type: string };
};

type Lot = { accountId: string; assetId: string; quantity: Decimal; unitCost: Decimal };
type PositionAccumulator = {
  asset: NonNullable<FinancialTransaction['asset']>;
  quantity: Decimal;
  cost: Decimal;
  lastPrice: Decimal;
  lastRate: Decimal;
};

const d = (value: { toString(): string } | string | number | null | undefined) => new Decimal(value?.toString() ?? 0);
const n = (value: Decimal) => Number(value.toDecimalPlaces(4).toString());

export function calculatePortfolio(transactions: FinancialTransaction[], marketPrices: Map<string, Decimal>) {
  const ordered = [...transactions].sort((a, b) => a.tradeAt.getTime() - b.tradeAt.getTime());
  const lots: Lot[] = [];
  const positionMap = new Map<string, PositionAccumulator>();
  let contributed = new Decimal(0);
  let withdrawn = new Decimal(0);
  let cashBalance = new Decimal(0);
  let realizedGain = new Decimal(0);
  let dividends = new Decimal(0);
  let interest = new Decimal(0);
  let totalFees = new Decimal(0);
  let totalTaxes = new Decimal(0);

  for (const transaction of ordered) {
    const rate = d(transaction.exchangeRate || 1);
    const gross = d(transaction.grossAmount).mul(rate);
    const fees = d(transaction.fees).mul(rate);
    const taxes = d(transaction.taxes).mul(rate);
    totalFees = totalFees.plus(fees);
    totalTaxes = totalTaxes.plus(taxes);

    switch (transaction.type) {
      case 'DEPOSIT': contributed = contributed.plus(gross); cashBalance = cashBalance.plus(gross); break;
      case 'WITHDRAWAL': withdrawn = withdrawn.plus(gross); cashBalance = cashBalance.minus(gross); break;
      case 'DIVIDEND': dividends = dividends.plus(gross); cashBalance = cashBalance.plus(gross).minus(fees).minus(taxes); break;
      case 'INTEREST': interest = interest.plus(gross); cashBalance = cashBalance.plus(gross).minus(fees).minus(taxes); break;
      case 'FEE': cashBalance = cashBalance.minus(gross); break;
      case 'TAX': cashBalance = cashBalance.minus(gross); break;
    }

    if (transaction.type !== 'TRADE' || !transaction.asset) continue;
    const quantity = d(transaction.quantity);
    const unitPrice = d(transaction.unitPrice).mul(rate);
    const key = `${transaction.accountId}:${transaction.asset.id}`;
    const current = positionMap.get(key) ?? { asset: transaction.asset, quantity: new Decimal(0), cost: new Decimal(0), lastPrice: unitPrice, lastRate: rate };
    current.lastPrice = unitPrice;
    current.lastRate = rate;

    if (transaction.side === 'BUY') {
      const totalCost = gross.plus(fees).plus(taxes);
      lots.push({ accountId: transaction.accountId, assetId: transaction.asset.id, quantity, unitCost: totalCost.div(quantity) });
      current.quantity = current.quantity.plus(quantity);
      current.cost = current.cost.plus(totalCost);
      cashBalance = cashBalance.minus(totalCost);
    }

    if (transaction.side === 'SELL') {
      let pending = quantity;
      let soldCost = new Decimal(0);
      for (const lot of lots) {
        if (pending.lte(0)) break;
        if (lot.accountId !== transaction.accountId || lot.assetId !== transaction.asset.id || lot.quantity.lte(0)) continue;
        const allocated = Decimal.min(lot.quantity, pending);
        soldCost = soldCost.plus(allocated.mul(lot.unitCost));
        lot.quantity = lot.quantity.minus(allocated);
        pending = pending.minus(allocated);
      }
      const netProceeds = gross.minus(fees).minus(taxes);
      realizedGain = realizedGain.plus(netProceeds.minus(soldCost));
      current.quantity = current.quantity.minus(quantity.minus(pending));
      current.cost = current.cost.minus(soldCost);
      cashBalance = cashBalance.plus(netProceeds);
    }
    positionMap.set(key, current);
  }

  const consolidated = new Map<string, PositionAccumulator>();
  for (const position of positionMap.values()) {
    if (position.quantity.lte(0)) continue;
    const current = consolidated.get(position.asset.id) ?? { ...position, quantity: new Decimal(0), cost: new Decimal(0) };
    current.quantity = current.quantity.plus(position.quantity);
    current.cost = current.cost.plus(position.cost);
    current.lastPrice = position.lastPrice;
    consolidated.set(position.asset.id, current);
  }

  let marketValue = new Decimal(0);
  const rawPositions = [...consolidated.values()].map((position) => {
    const currentPrice = marketPrices.get(position.asset.id) ?? position.lastPrice;
    const value = currentPrice.mul(position.quantity);
    const gain = value.minus(position.cost);
    marketValue = marketValue.plus(value);
    return { position, currentPrice, value, gain };
  });
  const positions = rawPositions.map(({ position, currentPrice, value, gain }) => ({
    assetId: position.asset.id,
    ticker: position.asset.ticker,
    name: position.asset.name,
    sector: position.asset.sector ?? 'Sin sector',
    assetType: position.asset.type,
    quantity: n(position.quantity),
    averagePrice: n(position.cost.div(position.quantity)),
    currentPrice: n(currentPrice),
    marketValue: n(value),
    gain: n(gain),
    gainPercent: position.cost.eq(0) ? 0 : n(gain.div(position.cost).mul(100)),
    weight: marketValue.eq(0) ? 0 : n(value.div(marketValue).mul(100)),
  })).sort((a, b) => b.marketValue - a.marketValue);

  const unrealizedGain = rawPositions.reduce((sum, item) => sum.plus(item.gain), new Decimal(0));
  const currentValue = marketValue.plus(cashBalance);
  const totalGain = currentValue.plus(withdrawn).minus(contributed);
  const returnPercent = contributed.eq(0) ? new Decimal(0) : totalGain.div(contributed).mul(100);

  return {
    metrics: {
      currentValue: n(currentValue),
      contributed: n(contributed),
      withdrawn: n(withdrawn),
      totalGain: n(totalGain),
      returnPercent: n(returnPercent),
      realizedGain: n(realizedGain),
      unrealizedGain: n(unrealizedGain),
      dividends: n(dividends),
      interest: n(interest),
      cashBalance: n(cashBalance),
      marketValue: n(marketValue),
      fees: n(totalFees),
      taxes: n(totalTaxes),
    },
    positions,
  };
}
