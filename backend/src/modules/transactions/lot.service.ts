import { Prisma, type TradeSide } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { HttpError } from '../../shared/errors/http-error.js';

type OpenLot = { id: string; remaining: Decimal; unitCost: Decimal };

export async function rebuildLots(tx: Prisma.TransactionClient, accountId: string, assetId: string) {
  await tx.lotAllocation.deleteMany({ where: { saleTransaction: { accountId, assetId } } });
  await tx.transactionLot.deleteMany({ where: { accountId, assetId } });

  const trades = await tx.transaction.findMany({
    where: { accountId, assetId, type: 'TRADE', status: 'CONFIRMED' },
    orderBy: [{ tradeAt: 'asc' }, { createdAt: 'asc' }],
  });
  const openLots: OpenLot[] = [];

  for (const trade of trades) {
    const quantity = new Decimal(trade.quantity?.toString() ?? 0);
    const price = new Decimal(trade.unitPrice?.toString() ?? 0);
    if (trade.side === ('BUY' satisfies TradeSide)) {
      const unitCost = price.plus(new Decimal(trade.fees.toString()).plus(trade.taxes.toString()).div(quantity));
      const lot = await tx.transactionLot.create({
        data: {
          accountId,
          assetId,
          purchaseTransactionId: trade.id,
          acquiredAt: trade.tradeAt,
          originalQuantity: quantity.toString(),
          remainingQuantity: quantity.toString(),
          unitCost: unitCost.toString(),
        },
      });
      openLots.push({ id: lot.id, remaining: quantity, unitCost });
      continue;
    }

    if (trade.side === ('SELL' satisfies TradeSide)) {
      let pending = quantity;
      const charges = new Decimal(trade.fees.toString()).plus(trade.taxes.toString());
      for (const lot of openLots) {
        if (pending.lte(0)) break;
        if (lot.remaining.lte(0)) continue;
        const allocated = Decimal.min(lot.remaining, pending);
        const allocatedCharges = charges.mul(allocated.div(quantity));
        const gain = price.mul(allocated).minus(lot.unitCost.mul(allocated)).minus(allocatedCharges);
        await tx.lotAllocation.create({
          data: { lotId: lot.id, saleTransactionId: trade.id, quantity: allocated.toString(), unitCost: lot.unitCost.toString(), realizedGain: gain.toString() },
        });
        lot.remaining = lot.remaining.minus(allocated);
        pending = pending.minus(allocated);
        await tx.transactionLot.update({ where: { id: lot.id }, data: { remainingQuantity: lot.remaining.toString() } });
      }
      if (pending.gt(0)) throw new HttpError(422, 'La venta supera la cantidad disponible para este activo.', 'INSUFFICIENT_POSITION');
    }
  }
}
