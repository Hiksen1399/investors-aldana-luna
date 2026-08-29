export type ImportBroker = 'HAPI' | 'XTB';

export interface NormalizedImportOperation {
  broker: ImportBroker;
  accountId?: string;
  externalAccountNumber?: string;
  externalOrderId?: string;
  sourceSymbol: string;
  symbol: string;
  providerSymbol: string;
  assetName: string;
  assetType: 'STOCK' | 'ETF' | 'FUND' | 'BOND' | 'CRYPTO' | 'FOREX' | 'COMMODITY' | 'CASH' | 'OTHER';
  exchange?: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  unitPrice: string;
  grossAmount: string;
  fees: string;
  taxes: string;
  currencyCode: string;
  exchangeRate: string;
  executedAt: string;
  confidence: number;
  warnings: string[];
  marketDataMatch?: {
    provider: 'TWELVE_DATA';
    symbol: string;
    providerSymbol: string;
    name: string;
    exchange?: string;
    country?: string;
    currency: string;
    confidence: number;
  };
}

export interface ParsedImportOperation {
  raw: Record<string, unknown>;
  normalized: NormalizedImportOperation;
}

export interface InboundEmailPayload {
  to: string;
  from: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  receivedAt?: string;
  attachments?: Array<{ filename: string; contentType?: string; contentBase64: string }>;
}
