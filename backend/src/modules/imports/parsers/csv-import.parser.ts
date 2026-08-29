import { parse } from 'csv-parse/sync';
import type { ImportBroker, ParsedImportOperation } from '../import.types.js';
import { calculateConfidence, parseFinancialNumber, parseOperationDate } from './parser.utils.js';

const value = (row: Record<string, string>, names: string[]) => {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase().trim().replace(/[ _-]/g, '') === name.replace(/[ _-]/g, ''));
    if (found?.[1]) return found[1].trim();
  }
  return undefined;
};

export function parseCsvImport(buffer: Buffer, broker: ImportBroker): ParsedImportOperation[] {
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true }) as Record<string, string>[];
  return rows.map((row) => {
    const sourceSymbol = value(row, ['ticker', 'symbol', 'simbolo', 'instrument']);
    const sideText = value(row, ['side', 'type', 'tipo', 'operation']) ?? 'BUY';
    const quantity = parseFinancialNumber(value(row, ['quantity', 'cantidad', 'volume', 'shares']));
    const unitPrice = parseFinancialNumber(value(row, ['unitprice', 'price', 'precio', 'openprice']));
    const total = value(row, ['grossamount', 'total', 'valortotal', 'amount']);
    const account = value(row, ['account', 'accountnumber', 'cuenta', 'numerocuenta']);
    const orderId = value(row, ['orderid', 'externalid', 'idorden', 'positionid']);
    const hasSuffix = broker === 'XTB' && Boolean(sourceSymbol?.match(/\.(US|UK|DE|PL)$/i));
    const warnings = hasSuffix ? ['Confirma el símbolo equivalente usado por el proveedor de precios.'] : [];
    const canonical = hasSuffix ? '' : sourceSymbol ?? '';
    return { raw: row, normalized: { broker, externalAccountNumber: account, externalOrderId: orderId, sourceSymbol: sourceSymbol ?? '', symbol: canonical, providerSymbol: canonical, assetName: value(row, ['name', 'assetname', 'nombre']) ?? sourceSymbol ?? 'Activo por revisar', assetType: 'STOCK', side: /SELL|VENTA/i.test(sideText) ? 'SELL' : 'BUY', quantity, unitPrice, grossAmount: total ? parseFinancialNumber(total) : String(Number(quantity) * Number(unitPrice)), fees: parseFinancialNumber(value(row, ['commission', 'comision', 'fees'])), taxes: parseFinancialNumber(value(row, ['taxes', 'impuestos'])), currencyCode: (value(row, ['currency', 'moneda']) ?? 'USD').toUpperCase(), exchangeRate: parseFinancialNumber(value(row, ['exchangerate', 'tipocambio']) ?? '1'), executedAt: parseOperationDate(value(row, ['date', 'executedat', 'fecha'])), confidence: calculateConfidence([sourceSymbol, sideText, quantity, unitPrice], warnings, hasSuffix ? 91 : 98), warnings } };
  });
}

