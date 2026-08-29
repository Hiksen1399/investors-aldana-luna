import type { ParsedImportOperation } from '../import.types.js';
import { calculateConfidence, extract, parseFinancialNumber, parseOperationDate } from './parser.utils.js';

function parseBlock(block: string, accountNumber?: string): ParsedImportOperation | null {
  const sideText = extract(block, [/(?:tipo|side|operation)\s*[:\-]?\s*(BUY|SELL|COMPRA|VENTA)/i, /\b(BUY|SELL|COMPRA|VENTA)\b/i]);
  const sourceSymbol = extract(block, [/(?:ticker|s[ií]mbolo|symbol|instrumento)\s*[:\-]?\s*([A-Z0-9._-]+)/i]);
  const quantity = parseFinancialNumber(extract(block, [/(?:cantidad|volume|quantity|shares)\s*[:\-]?\s*([\d.,]+)/i]));
  const unitPrice = parseFinancialNumber(extract(block, [/(?:precio(?: unitario| de apertura)?|price|open price)\s*[:\-]?\s*(?:US\$|USD|\$)?\s*([\d.,]+)/i]));
  const total = extract(block, [/(?:valor total|total value|importe|amount)\s*[:\-]?\s*(?:US\$|USD|\$)?\s*([\d.,]+)/i]);
  const orderId = extract(block, [/(?:order|orden|position)\s*(?:id|number|no\.?|#)?\s*[:#\-]?\s*([A-Z0-9-]{3,})/i]);
  const date = extract(block, [/(?:fecha(?: y hora)?|date|time)\s*[:\-]?\s*([^\n]+)/i]);
  const currency = extract(block, [/\b(?:moneda|currency)\s*[:\-]?\s*([A-Z]{3})\b/i, /\b(USD|EUR|GBP|COP)\b/])?.toUpperCase() ?? 'USD';
  const fees = parseFinancialNumber(extract(block, [/(?:comisi[oó]n|commission)\s*[:\-]?\s*([\d.,-]+)/i]));
  if (!sourceSymbol && quantity === '0' && unitPrice === '0') return null;
  const warnings: string[] = [];
  const hasBrokerSuffix = Boolean(sourceSymbol?.match(/\.(US|UK|DE|PL)$/i));
  if (hasBrokerSuffix) warnings.push('Confirma el símbolo equivalente usado por el proveedor de precios.');
  if (!accountNumber) warnings.push('No se encontró el número de cuenta XTB.');
  if (!orderId) warnings.push('No se encontró el identificador de la orden.');
  const canonical = hasBrokerSuffix ? '' : sourceSymbol ?? '';
  const confidence = calculateConfidence([sourceSymbol, sideText, quantity, unitPrice, accountNumber], warnings, hasBrokerSuffix ? 91 : 98);
  return {
    raw: { broker: 'XTB', block: block.slice(0, 8_000) },
    normalized: {
      broker: 'XTB', externalAccountNumber: accountNumber, externalOrderId: orderId, sourceSymbol: sourceSymbol ?? '', symbol: canonical, providerSymbol: canonical,
      assetName: sourceSymbol ?? 'Instrumento por revisar', assetType: 'STOCK', side: /SELL|VENTA/i.test(sideText ?? '') ? 'SELL' : 'BUY', quantity, unitPrice,
      grossAmount: total ? parseFinancialNumber(total) : String(Number(quantity) * Number(unitPrice)), fees, taxes: '0', currencyCode: currency, exchangeRate: '1', executedAt: parseOperationDate(date), confidence, warnings,
    },
  };
}

export function parseXtbDocument(text: string): ParsedImportOperation[] {
  const clean = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const accountNumber = extract(clean, [/(?:n[uú]mero de cuenta|cuenta|account(?: number| no\.?)?)\s*[:#\-]?\s*([A-Z0-9-]{4,})/i]);
  const labeledBlocks = clean.split(/(?=(?:order|orden|position)\s*(?:id|number|no\.?|#)?\s*[:#\-])/i).filter((part) => part.trim().length > 20);
  const parsed = labeledBlocks.map((block) => parseBlock(block, accountNumber)).filter((row): row is ParsedImportOperation => Boolean(row));
  if (parsed.length) return parsed;

  const rows: ParsedImportOperation[] = [];
  const tablePattern = /^\s*([A-Z0-9-]{3,})\s+(BUY|SELL)\s+([A-Z0-9._-]+)\s+([\d.,]+)\s+([\d.,]+)(?:\s+([\d.,]+))?(?:\s+([A-Z]{3}))?/gim;
  for (const match of clean.matchAll(tablePattern)) {
    const [, orderId, side, sourceSymbol, quantity, unitPrice, total, currency = 'USD'] = match;
    const hasSuffix = Boolean(sourceSymbol!.match(/\.(US|UK|DE|PL)$/i));
    const warnings = hasSuffix ? ['Confirma el símbolo equivalente usado por el proveedor de precios.'] : [];
    rows.push({ raw: { broker: 'XTB', row: match[0] }, normalized: { broker: 'XTB', externalAccountNumber: accountNumber, externalOrderId: orderId, sourceSymbol: sourceSymbol!, symbol: hasSuffix ? '' : sourceSymbol!, providerSymbol: hasSuffix ? '' : sourceSymbol!, assetName: sourceSymbol!, assetType: 'STOCK', side: side as 'BUY' | 'SELL', quantity: parseFinancialNumber(quantity), unitPrice: parseFinancialNumber(unitPrice), grossAmount: total ? parseFinancialNumber(total) : String(Number(parseFinancialNumber(quantity)) * Number(parseFinancialNumber(unitPrice))), fees: '0', taxes: '0', currencyCode: currency, exchangeRate: '1', executedAt: new Date().toISOString(), confidence: hasSuffix ? 82 : 94, warnings } });
  }
  return rows;
}

