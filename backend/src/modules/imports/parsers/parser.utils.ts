import { createHash } from 'node:crypto';
import type { NormalizedImportOperation } from '../import.types.js';

export function parseFinancialNumber(value: string | number | undefined | null): string {
  if (value == null) return '0';
  let normalized = String(value).replace(/[^\d,.-]/g, '').trim();
  if (!normalized) return '0';
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  else if (comma >= 0) normalized = normalized.replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : '0';
}

export function parseOperationDate(value: string | undefined, fallback = new Date()): string {
  if (!value) return fallback.toISOString();
  const latin = value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (latin) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = latin;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

export function extract(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export function duplicateKey(value: NormalizedImportOperation, accountId?: string) {
  const source = [accountId ?? value.externalAccountNumber ?? '', value.broker, value.externalOrderId ?? '', value.sourceSymbol, value.side, value.quantity, value.unitPrice, value.executedAt].join('|');
  return createHash('sha256').update(source).digest('hex');
}

export function calculateConfidence(required: Array<unknown>, warnings: string[], base = 100) {
  const missing = required.filter((value) => value == null || value === '' || value === '0').length;
  return Math.max(0, Math.min(100, base - missing * 18 - warnings.length * 4));
}

