import { describe, expect, it } from 'vitest';
import { parseCsvImport } from '../parsers/csv-import.parser.js';
import { parseHapiEmail } from '../parsers/hapi-email.parser.js';
import { duplicateKey, parseFinancialNumber, parseOperationDate } from '../parsers/parser.utils.js';
import { parseXtbDocument } from '../parsers/xtb-document.parser.js';

describe('import parsers', () => {
  it('ignora correos Hapi que no contienen una compra o venta completa', () => {
    expect(parseHapiEmail('Dividend from QQQ received!')).toEqual([]);
    expect(parseHapiEmail('Sé de los primeros en depositar desde tu banco americano.')).toEqual([]);
    expect(parseHapiEmail('Order Placed\nBuy/Sell: Buy\nTicker: NVDA\nQuantity Shares: 1\nAverage price: US$ 100')).toEqual([]);
  });

  it('extrae una compra realista del cuerpo de Hapi', () => {
    const [row] = parseHapiEmail(`Tu orden de compra fue ejecutada
Ticker: NVDA
Empresa: NVIDIA Corporation
Cantidad: 0.081
Precio promedio: USD 189.075
Valor total: USD 15.315
Número de orden: HAPI-10992
Fecha: 12/07/2026 10:30`, new Date('2026-07-12T15:30:00Z'));
    expect(row?.normalized).toMatchObject({ broker: 'HAPI', symbol: 'NVDA', assetName: 'NVDA', side: 'BUY', quantity: '0.081', unitPrice: '189.075', externalOrderId: 'HAPI-10992' });
    expect(row!.normalized.confidence).toBeGreaterThanOrEqual(98);
  });

  it('lee el valor Sell después de Buy/Sell en el formato real de Order Executed', () => {
    const [row] = parseHapiEmail(`✅ Order Executed
Your order has been executed. You are now a shareholder of:
Order type: Market order
Buy/Sell: Sell
Ticker: NVDA
Quantity Shares: 0.1
Average price: US$ 227.73450
Cost: US$ 22.77
Status: Order completed`);
    expect(row?.normalized).toMatchObject({ sourceSymbol: 'NVDA', symbol: 'NVDA', assetName: 'NVDA', side: 'SELL', quantity: '0.1', unitPrice: '227.7345' });
  });

  it('extrae varias órdenes XTB y obliga a mapear el sufijo del broker', () => {
    const rows = parseXtbDocument(`Número de cuenta: 778899
Order ID: XTB-1
Symbol: NVDA.US
Side: BUY
Quantity: 2.5
Price: 190.25
Currency: USD
Date: 12/07/2026 11:00
Order ID: XTB-2
Symbol: IGLN.UK
Side: SELL
Quantity: 1
Price: 84.10
Currency: USD
Date: 12/07/2026 12:00`);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.normalized).toMatchObject({ sourceSymbol: 'NVDA.US', symbol: '', externalAccountNumber: '778899' });
    expect(rows[0]?.normalized.warnings[0]).toContain('símbolo equivalente');
  });

  it('procesa CSV con comisiones e impuestos', () => {
    const [row] = parseCsvImport(Buffer.from('ticker,side,quantity,price,total,commission,taxes,currency,date,orderid\nVOO,BUY,1.25,600,750,1.5,0.2,USD,2026-07-12T15:00:00Z,CSV-1'), 'HAPI');
    expect(row?.normalized).toMatchObject({ symbol: 'VOO', quantity: '1.25', grossAmount: '750', fees: '1.5', taxes: '0.2' });
  });

  it('normaliza formatos numéricos latinos e internacionales', () => {
    expect(parseFinancialNumber('US$ 1.234,56')).toBe('1234.56');
    expect(parseFinancialNumber('$1,234.56')).toBe('1234.56');
  });

  it('conserva la fecha de ejecución separada de la fecha de importación', () => {
    expect(parseOperationDate('12/07/2026 10:30')).toBe('2026-07-12T10:30:00.000Z');
  });

  it('produce la misma huella para la misma orden', () => {
    const operation = parseHapiEmail('Orden ejecutada\nCompra\nTicker: KO\nCantidad: 2\nPrecio: 70\nOrden: ABC-123')[0]!.normalized;
    expect(duplicateKey(operation, 'account-1')).toBe(duplicateKey(operation, 'account-1'));
    expect(duplicateKey(operation, 'account-1')).not.toBe(duplicateKey(operation, 'account-2'));
  });
});
