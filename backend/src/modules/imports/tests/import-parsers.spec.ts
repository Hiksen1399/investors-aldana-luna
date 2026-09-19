import { describe, expect, it } from 'vitest';
import { parseCsvImport } from '../parsers/csv-import.parser.js';
import { parseHapiEmail } from '../parsers/hapi-email.parser.js';
import { duplicateKey, parseFinancialNumber, parseOperationDate } from '../parsers/parser.utils.js';
import { parseXtbDocument } from '../parsers/xtb-document.parser.js';
import { arrangePdfText } from '../parsers/pdf-text.extractor.js';

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

  it('extrae todas las compras y ventas de la tabla DailyStatement real de XTB', () => {
    const rows = parseXtbDocument(`Confirmación de órdenes ejecutadas en 8/6/2026
Cuenta 53604716
1 2618965862 IGLN.UK Shares, ACC, USD XTB Buy 0,2984 8/6/2026 9:01:12 market 83,41750 24,89178 ETC USD 1.0000 0,00 0,00 0,00
2 2618965990 IGLN.UK Shares, ACC, USD XTB Buy 0,9740 8/6/2026 9:01:19 market 25,20000 24,54840 ETC USD 1.0000 0,00 0,00 0,00
3 2618967436 NVDA.US NVIDIA Corp XTB Buy 0,1225 8/6/2026 15:30:16 market 210,13000 25,74093 Cash Stocks USD 1.0000 -0,12 0,00 -0,12
4 2618968001 TSLA.US Tesla Inc XTB Sell 0,0644 8/6/2026 15:30:17 market 396,25000 25,51850 Cash Stocks USD 1.0000 0,00 0,00 0,00`);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.normalized).toMatchObject({ externalAccountNumber: '53604716', externalOrderId: '2618965862', sourceSymbol: 'IGLN.UK', assetName: 'Shares, ACC, USD', side: 'BUY', quantity: '0.2984', unitPrice: '83.4175', grossAmount: '24.89178', currencyCode: 'USD' });
    expect(rows[2]?.normalized).toMatchObject({ sourceSymbol: 'NVDA.US', assetName: 'NVIDIA Corp', fees: '0.12', executedAt: '2026-06-08T15:30:16.000Z' });
    expect(rows[3]?.normalized.side).toBe('SELL');
  });

  it('lee el formato actual de XTB con la operación en el encabezado y la hora en la línea siguiente', () => {
    const rows = parseXtbDocument(`Confirmación de órdenes ejecutadas en 22/6/2026
Nombre y Apellidos Cuenta Divisa de la cuenta Patrimonio
Usuario de prueba 53604716 USD 1,11
Órdenes de compra ejecutadas en intrumentos OMI (Acciones y ETFs) (1)
Nº Identificación de Ticker Nombre del Sistema de Tipo Volumen Fecha y hora de Orden de Precio de la Precio total Tipo de activo Divisa de Tipo de cambio Comisión cambio Comisión Coste total
1 2650420764 EC.US Ecopetrol SA - KNEM 2,0000 22/6/2026 market 17,57000 35,14000 Cash Stocks USD 1.0000 0,00 0,00 0,00
ADR 15:31:59
Órdenes de compra de Acciones Fraccionadas ejecutadas (1)
1 2650420764 EC.US Ecopetrol SA - XTB 0,9310 22/6/2026 15:31:58 market 17,60000 16,38560 Cash Stocks USD 1.0000 0,00 0,00 0,00
ADR
Órdenes de venta de Acciones Fraccionadas ejecutadas (2)
1 2649034887 AVAV.US AeroVironment XTB 0,1156 22/6/2026 market 158,56000 18,32954 Cash Stocks USD 1.0000 0,00 0,00 0,00
Inc 15:30:04
2 2649035119 XOM.US Exxon Mobil XTB 0,2421 22/6/2026 market 138,00000 33,40980 Cash Stocks USD 1.0000 0,00 0,00 0,00
Corp 15:30:06`, '53604716');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.normalized).toMatchObject({ externalAccountNumber: '53604716', externalOrderId: '2650420764:OMI', sourceSymbol: 'EC.US', assetName: 'Ecopetrol SA - ADR', side: 'BUY', quantity: '2', unitPrice: '17.57', executedAt: '2026-06-22T15:31:59.000Z' });
    expect(rows[1]?.normalized).toMatchObject({ externalOrderId: '2650420764:FRACTIONAL', side: 'BUY', quantity: '0.931' });
    expect(rows[2]?.normalized).toMatchObject({ sourceSymbol: 'AVAV.US', assetName: 'AeroVironment Inc', side: 'SELL' });
    expect(rows[3]?.normalized).toMatchObject({ sourceSymbol: 'XOM.US', assetName: 'Exxon Mobil Corp', side: 'SELL' });
  });

  it('reconstruye las filas visuales del PDF antes de analizar la tabla', () => {
    const text = arrangePdfText([
      { str: 'Buy', transform: [1, 0, 0, 1, 300, 700] },
      { str: '2618965862', transform: [1, 0, 0, 1, 30, 700] },
      { str: 'Encabezado', transform: [1, 0, 0, 1, 20, 730] },
      { str: '0,2984', transform: [1, 0, 0, 1, 350, 700] },
    ]);
    expect(text).toBe('Encabezado\n2618965862\tBuy\t0,2984');
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
