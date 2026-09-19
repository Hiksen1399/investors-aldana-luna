import type { NormalizedImportOperation, ParsedImportOperation } from '../import.types.js';
import { calculateConfidence, extract, parseFinancialNumber, parseOperationDate } from './parser.utils.js';

const brokerSuffix = /\.(US|UK|DE|PL|FR|IT|ES|NL|CA|AU)$/i;
const financialNumberPattern = String.raw`[-+]?\d[\d.,]*`;
const executionDatePattern = String.raw`\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?`;
const executionDayPattern = String.raw`\d{1,2}[\/-]\d{1,2}[\/-]\d{4}`;
const normalizeWords = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function assetType(value: string): NormalizedImportOperation['assetType'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('etf') || normalized.includes('etc')) return 'ETF';
  if (normalized.includes('fund')) return 'FUND';
  if (normalized.includes('bond')) return 'BOND';
  if (normalized.includes('stock') || normalized.includes('share')) return 'STOCK';
  return 'OTHER';
}

function positiveAmount(value: string | undefined) {
  return String(Math.abs(Number(parseFinancialNumber(value))));
}

function sectionDetails(line: string) {
  const normalized = normalizeWords(line);
  if (!/^ordenes de (?:compra|venta)/.test(normalized)) return undefined;
  return {
    side: normalized.includes('ordenes de venta') ? 'SELL' as const : 'BUY' as const,
    component: normalized.includes('fraccionad') ? 'FRACTIONAL' : normalized.includes('omi') ? 'OMI' : 'TRADE',
  };
}

function parseCurrentDailyStatement(text: string, accountNumber?: string): ParsedImportOperation[] {
  const rowPattern = new RegExp(
    String.raw`^(\d+)\s+(\d{6,})\s+([A-Z0-9][A-Z0-9._-]{1,30})\s+(.+?)\s+([A-Z]{3,8})\s+(${financialNumberPattern})\s+(${executionDayPattern})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?\s+(?:market|limit|stop(?:\s+limit)?)\s+(${financialNumberPattern})\s+(${financialNumberPattern})\s+(.+?)\s+([A-Z]{3})\s+(${financialNumberPattern})\s+(${financialNumberPattern})\s+(${financialNumberPattern})\s+(${financialNumberPattern})$`,
    'i',
  );
  const lines = text.split('\n');
  const rows: ParsedImportOperation[] = [];
  let section: ReturnType<typeof sectionDetails>;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const nextSection = sectionDetails(line);
    if (nextSection) {
      section = nextSection;
      continue;
    }
    const match = line.match(rowPattern);
    if (!match || !section) continue;
    const [, , orderId, sourceSymbol, instrumentName, executionSystem, quantityValue, date, inlineTime, unitPriceValue, totalValue, typeText, currency, exchangeRateValue, exchangeCommission, commission, totalCost] = match;
    const continuations: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor]!;
      if (candidate.match(rowPattern) || sectionDetails(candidate) || /^(?:XTB International|N[ºo]\s|Nombre y Apellidos|Confirmaci[oó]n de|orden instrumento|[ÓO]rdenes instrumento|relacionado con|las Acciones|Fraccionadas|Comisi[oó]n de Servicios|35 Barrack|registro\s|Belize City|\d+\/\d+$)/i.test(candidate)) break;
      continuations.push(candidate);
      cursor++;
    }
    index = cursor - 1;
    const continuationText = continuations.join(' ');
    const time = inlineTime ?? continuationText.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/)?.[1] ?? '00:00:00';
    const nameContinuation = continuationText.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ').replace(/\s+/g, ' ').trim();
    const extractedName = `${instrumentName} ${nameContinuation}`.replace(/\s+/g, ' ').trim();
    const quantity = parseFinancialNumber(quantityValue);
    const unitPrice = parseFinancialNumber(unitPriceValue);
    const warnings = brokerSuffix.test(sourceSymbol!) ? ['Confirma el símbolo equivalente usado por el proveedor de precios.'] : [];
    if (!accountNumber) warnings.push('No se encontró el número de cuenta XTB.');
    const parsedTotalCost = positiveAmount(totalCost);
    const fallbackFees = String(Math.abs(Number(parseFinancialNumber(exchangeCommission))) + Math.abs(Number(parseFinancialNumber(commission))));
    const canonical = brokerSuffix.test(sourceSymbol!) ? '' : sourceSymbol!;
    const assetName = /^ishares,?\s+acc/i.test(extractedName) ? sourceSymbol! : extractedName;
    rows.push({
      raw: { broker: 'XTB', row: [line, ...continuations].join('\n'), instrumentName: extractedName, executionSystem, component: section.component, exchangeCommission, commission, totalCost },
      normalized: {
        broker: 'XTB', externalAccountNumber: accountNumber, externalOrderId: `${orderId}:${section.component}`, sourceSymbol: sourceSymbol!, symbol: canonical, providerSymbol: canonical,
        assetName, assetType: assetType(typeText!), side: section.side, quantity, unitPrice, grossAmount: parseFinancialNumber(totalValue),
        fees: parsedTotalCost !== '0' ? parsedTotalCost : fallbackFees, taxes: '0', currencyCode: currency!.toUpperCase(), exchangeRate: parseFinancialNumber(exchangeRateValue) || '1',
        executedAt: parseOperationDate(`${date} ${time}`), confidence: calculateConfidence([orderId, sourceSymbol, section.side, quantity, unitPrice, date, accountNumber], warnings, 98), warnings,
      },
    });
  }
  return rows;
}

function parseInlineSideDailyStatement(text: string, accountNumber?: string): ParsedImportOperation[] {
  const rowPattern = new RegExp(
    String.raw`(?:^|\n)\s*\d+\s+(\d{6,})\s+([A-Z0-9][A-Z0-9._-]{1,30})\s+([\s\S]{1,180}?)\s+XTB\s+(Buy|Sell|Compra|Venta)\s+(${financialNumberPattern})\s+(${executionDatePattern})\s+(?:market|limit|stop(?:\s+limit)?)\s+(${financialNumberPattern})\s+(${financialNumberPattern})\s+([^\n]{1,50}?)\s+([A-Z]{3})\s+(${financialNumberPattern})\s+(${financialNumberPattern})\s+(${financialNumberPattern})\s+(${financialNumberPattern})`,
    'gim',
  );
  const rows: ParsedImportOperation[] = [];
  for (const match of text.matchAll(rowPattern)) {
    const [, orderId, sourceSymbol, instrumentName, sideText, quantityValue, date, unitPriceValue, totalValue, typeText, currency, exchangeRateValue, exchangeCommission, commission, totalCost] = match;
    const quantity = parseFinancialNumber(quantityValue);
    const unitPrice = parseFinancialNumber(unitPriceValue);
    const warnings = brokerSuffix.test(sourceSymbol!) ? ['Confirma el símbolo equivalente usado por el proveedor de precios.'] : [];
    if (!accountNumber) warnings.push('No se encontró el número de cuenta XTB.');
    const parsedTotalCost = positiveAmount(totalCost);
    const fallbackFees = String(Math.abs(Number(parseFinancialNumber(exchangeCommission))) + Math.abs(Number(parseFinancialNumber(commission))));
    const canonical = brokerSuffix.test(sourceSymbol!) ? '' : sourceSymbol!;
    rows.push({
      raw: { broker: 'XTB', row: match[0].trim(), exchangeCommission, commission, totalCost },
      normalized: {
        broker: 'XTB', externalAccountNumber: accountNumber, externalOrderId: orderId, sourceSymbol: sourceSymbol!, symbol: canonical, providerSymbol: canonical,
        assetName: instrumentName!.replace(/\s+/g, ' ').trim() || sourceSymbol!, assetType: assetType(typeText!), side: /sell|venta/i.test(sideText!) ? 'SELL' : 'BUY',
        quantity, unitPrice, grossAmount: parseFinancialNumber(totalValue), fees: parsedTotalCost !== '0' ? parsedTotalCost : fallbackFees, taxes: '0',
        currencyCode: currency!.toUpperCase(), exchangeRate: parseFinancialNumber(exchangeRateValue) || '1', executedAt: parseOperationDate(date),
        confidence: calculateConfidence([orderId, sourceSymbol, sideText, quantity, unitPrice, date, accountNumber], warnings, 98), warnings,
      },
    });
  }
  return rows;
}

function parseBlock(block: string, accountNumber?: string): ParsedImportOperation | null {
  const sideText = extract(block, [/(?:tipo|side|operation)\s*[:\-]?\s*(BUY|SELL|COMPRA|VENTA)/i, /\b(BUY|SELL|COMPRA|VENTA)\b/i]);
  const sourceSymbol = extract(block, [/(?:ticker|simbolo|símbolo|symbol|instrumento)\s*[:\-]?\s*([A-Z0-9._-]+)/i]);
  const quantity = parseFinancialNumber(extract(block, [/(?:cantidad|volume|quantity|shares)\s*[:\-]?\s*([\d.,]+)/i]));
  const unitPrice = parseFinancialNumber(extract(block, [/(?:precio(?: unitario| de apertura)?|price|open price)\s*[:\-]?\s*(?:US\$|USD|\$)?\s*([\d.,]+)/i]));
  const total = extract(block, [/(?:valor total|total value|importe|amount)\s*[:\-]?\s*(?:US\$|USD|\$)?\s*([\d.,]+)/i]);
  const orderId = extract(block, [/(?:order|orden|position)\s*(?:id|number|no\.?|#)?\s*[:#\-]?\s*([A-Z0-9-]{3,})/i]);
  const date = extract(block, [/(?:fecha(?: y hora)?|date|time)\s*[:\-]?\s*([^\n]+)/i]);
  const currency = extract(block, [/\b(?:moneda|currency)\s*[:\-]?\s*([A-Z]{3})\b/i, /\b(USD|EUR|GBP|COP)\b/])?.toUpperCase() ?? 'USD';
  const fees = positiveAmount(extract(block, [/(?:comision|comisión|commission)\s*[:\-]?\s*([\d.,-]+)/i]));
  if (!sourceSymbol && quantity === '0' && unitPrice === '0') return null;
  const warnings: string[] = [];
  const hasBrokerSuffix = Boolean(sourceSymbol?.match(brokerSuffix));
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

export function parseXtbDocument(text: string, fallbackAccountNumber?: string): ParsedImportOperation[] {
  const clean = text.replace(/\r/g, '').replace(/\u00a0/g, ' ').split('\n').map((line) => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n');
  const accountNumber = fallbackAccountNumber ?? extract(clean, [/(?:numero de cuenta|número de cuenta|cuenta|account(?: number| no\.?)?)\s*[:#\-]?\s*([0-9]{4,})/i, /\b([0-9]{6,})\s+(?:USD|EUR|GBP|COP)\b/]);
  const currentRows = parseCurrentDailyStatement(clean, accountNumber);
  if (currentRows.length) return currentRows;
  const dailyRows = parseInlineSideDailyStatement(clean, accountNumber);
  if (dailyRows.length) return dailyRows;

  const labeledBlocks = clean.split(/(?=(?:order|orden|position)\s*(?:id|number|no\.?|#)?\s*[:#\-])/i).filter((part) => part.trim().length > 20);
  const parsed = labeledBlocks.map((block) => parseBlock(block, accountNumber)).filter((row): row is ParsedImportOperation => Boolean(row));
  if (parsed.length) return parsed;

  const rows: ParsedImportOperation[] = [];
  const tablePattern = /^\s*([A-Z0-9-]{3,})\s+(BUY|SELL)\s+([A-Z0-9._-]+)\s+([\d.,]+)\s+([\d.,]+)(?:\s+([\d.,]+))?(?:\s+([A-Z]{3}))?/gim;
  for (const match of clean.matchAll(tablePattern)) {
    const [, orderId, side, sourceSymbol, quantity, unitPrice, total, currency = 'USD'] = match;
    const hasSuffix = Boolean(sourceSymbol!.match(brokerSuffix));
    const warnings = hasSuffix ? ['Confirma el símbolo equivalente usado por el proveedor de precios.'] : [];
    rows.push({ raw: { broker: 'XTB', row: match[0] }, normalized: { broker: 'XTB', externalAccountNumber: accountNumber, externalOrderId: orderId, sourceSymbol: sourceSymbol!, symbol: hasSuffix ? '' : sourceSymbol!, providerSymbol: hasSuffix ? '' : sourceSymbol!, assetName: sourceSymbol!, assetType: 'STOCK', side: side as 'BUY' | 'SELL', quantity: parseFinancialNumber(quantity), unitPrice: parseFinancialNumber(unitPrice), grossAmount: total ? parseFinancialNumber(total) : String(Number(parseFinancialNumber(quantity)) * Number(parseFinancialNumber(unitPrice))), fees: '0', taxes: '0', currencyCode: currency, exchangeRate: '1', executedAt: new Date().toISOString(), confidence: hasSuffix ? 82 : 94, warnings } });
  }
  return rows;
}
