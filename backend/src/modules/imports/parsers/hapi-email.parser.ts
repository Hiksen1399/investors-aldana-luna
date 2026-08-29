import type { ParsedImportOperation } from '../import.types.js';
import { calculateConfidence, extract, parseFinancialNumber, parseOperationDate } from './parser.utils.js';

export function parseHapiEmail(text: string, receivedAt = new Date()): ParsedImportOperation[] {
  const clean = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const sideText = extract(clean, [/(?:tipo de (?:operaci[oó]n|orden)|operaci[oó]n|lado|side)\s*[:\-]?\s*(compra|venta|buy|sell)/i, /\b(compraste|vendiste|compra|venta|buy|sell)\b/i]);
  const side = /venta|sell|vendiste/i.test(sideText ?? '') ? 'SELL' : 'BUY';
  const symbol = extract(clean, [/(?:ticker|s[ií]mbolo|symbol)\s*[:\-]?\s*\$?([A-Z][A-Z0-9.-]{0,20})/i, /(?:activo|instrumento)\s*[:\-]?\s*\$?([A-Z][A-Z0-9.-]{0,20})\s*(?:\n|$)/i, /\$([A-Z]{1,10})\b/]);
  const assetName = extract(clean, [/(?:empresa|nombre (?:de la empresa|del activo)|compañ[ií]a|company|security name)\s*[:\-]?\s*([^\n]{2,180})/i, /(?:activo|instrumento)\s*[:\-]?\s*([^\n]{2,180})/i]);
  const quantity = parseFinancialNumber(extract(clean, [/(?:cantidad|quantity|acciones|shares)\s*[:\-]?\s*([\d.,]+)/i]));
  const unitPrice = parseFinancialNumber(extract(clean, [/(?:precio(?:\s+(?:promedio|unitario|de ejecuci[oó]n))?|average price|unit price|price)\s*[:\-]?\s*(?:US\$|USD|\$)?\s*([\d.,]+)/i]));
  const totalValue = extract(clean, [/(?:valor total|monto total|total|importe)\s*[:\-]?\s*(?:US\$|USD|\$)?\s*([\d.,]+)/i]);
  const currency = extract(clean, [/\b(?:moneda|currency)\s*[:\-]?\s*([A-Z]{3})\b/i, /\b(USD|COP|EUR|GBP)\b/])?.toUpperCase() ?? 'USD';
  const date = extract(clean, [/(?:fecha(?: y hora)?|date)\s*[:\-]?\s*([^\n]+)/i]);
  const orderId = extract(clean, [/(?:id|n[uú]mero|no\.?)[\s\-]*(?:de\s+)?(?:la\s+)?orden\s*[:#\-]?\s*([A-Z0-9-]+)/i, /order\s*(?:id|number|no\.?)\s*[:#\-]?\s*([A-Z0-9-]+)/i]);
  if (!sideText || !symbol || Number(quantity) <= 0 || Number(unitPrice) <= 0) return [];
  const warnings: string[] = [];
  if (!symbol) warnings.push('No se encontró el ticker.');
  if (!orderId) warnings.push('La orden no contiene un identificador externo.');
  const grossAmount = totalValue ? parseFinancialNumber(totalValue) : String(Number(quantity) * Number(unitPrice));
  const confidence = calculateConfidence([symbol, sideText, quantity, unitPrice], warnings, orderId ? 100 : 96);
  return [{
    raw: { broker: 'HAPI', text: clean.slice(0, 12_000) },
    normalized: {
      broker: 'HAPI', externalOrderId: orderId, sourceSymbol: symbol ?? '', symbol: symbol ?? '', providerSymbol: symbol ?? '', assetName: assetName ?? symbol ?? 'Activo por revisar', assetType: 'STOCK', side,
      quantity, unitPrice, grossAmount, fees: '0', taxes: '0', currencyCode: currency, exchangeRate: '1', executedAt: parseOperationDate(date, receivedAt), confidence, warnings,
    },
  }];
}
