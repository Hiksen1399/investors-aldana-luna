export interface User {
  id: string;
  email: string;
  status: string;
  profile: { fullName: string; timezone: string; locale: string; baseCurrencyCode: string };
}

export interface Portfolio {
  id: string;
  name: string;
  description?: string;
  objective?: string;
  baseCurrencyCode: string;
  workspace?: { id: string; name: string; type: string; members?: Array<{ role: string }> };
  _count?: { accounts: number };
}

export interface Broker {
  id: string;
  slug: string;
  name: string;
}

export interface BrokerAccount {
  id: string;
  name: string;
  currencyCode: string;
  externalAccountNumber?: string;
  objective?: string;
  autoImportEnabled: boolean;
  broker: Broker;
  portfolio: Pick<Portfolio, 'id' | 'name' | 'baseCurrencyCode'>;
  _count?: { transactions: number };
}

export interface Asset {
  id: string;
  ticker: string;
  name: string;
  type: string;
  currencyCode: string;
  exchange?: string;
  sector?: string;
}

export interface Transaction {
  id: string;
  type: string;
  side?: 'BUY' | 'SELL';
  status: string;
  source: string;
  tradeAt: string;
  quantity?: string;
  unitPrice?: string;
  grossAmount: string;
  fees: string;
  taxes: string;
  currencyCode: string;
  notes?: string;
  asset?: Asset;
  account: BrokerAccount;
}

export interface DashboardSummary {
  portfolio: { id: string; name: string; currency: string };
  metrics: {
    currentValue: number; contributed: number; withdrawn: number; totalGain: number; returnPercent: number;
    realizedGain: number; unrealizedGain: number; dividends: number; interest: number; cashBalance: number;
    marketValue: number; fees: number; taxes: number;
  };
  positions: Array<{
    assetId: string; ticker: string; name: string; sector: string; assetType: string; quantity: number;
    averagePrice: number; currentPrice: number; marketValue: number; gain: number; gainPercent: number; weight: number;
  }>;
  accounts: Array<{ id: string; name: string; broker: string; value: number; gain: number; returnPercent: number }>;
  allocationByBroker: Array<{ name: string; value: number }>;
  updatedAt: string;
}

export interface HistoryPoint { date: string; contributed: number; portfolioValue: number; marketValue: number; cashBalance: number }

export interface ImportRow {
  id: string;
  rowNumber: number;
  confidence?: string | number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DUPLICATE' | 'ERROR';
  normalizedData: Record<string, any>;
  validationErrors?: unknown;
  transaction?: { id: string };
}

export interface ImportBatch {
  id: string;
  status: string;
  source: string;
  fileName?: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  reviewRows: number;
  errorMessage?: string;
  createdAt: string;
  account?: BrokerAccount;
  rows?: ImportRow[];
  _count?: { rows: number };
  duplicateBatch?: boolean;
}

export interface OutlookConnectionStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
}

export interface XtbPasswordStatus {
  accountId: string;
  accountName: string;
  configured: boolean;
  updatedAt: string | null;
  lastValidatedAt: string | null;
}
