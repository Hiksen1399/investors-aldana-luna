import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import type { Asset, Broker, BrokerAccount, DashboardSummary, HistoryPoint, ImportBatch, ImportRow, OutlookConnectionStatus, Portfolio, Transaction, XtbPasswordStatus } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  portfolios() { return this.http.get<{ data: Portfolio[] }>(`${this.base}/portfolios`); }
  createPortfolio(input: Partial<Portfolio>) { return this.http.post<{ data: Portfolio }>(`${this.base}/portfolios`, input); }
  archivePortfolio(id: string) { return this.http.delete(`${this.base}/portfolios/${id}`); }
  summary(portfolioId: string, accountId?: string) {
    const params = accountId ? new HttpParams().set('accountId', accountId) : undefined;
    return this.http.get<{ data: DashboardSummary }>(`${this.base}/portfolios/${portfolioId}/summary`, { params });
  }
  history(portfolioId: string) { return this.http.get<{ data: HistoryPoint[] }>(`${this.base}/portfolios/${portfolioId}/history`); }
  accounts(portfolioId?: string) {
    const params = portfolioId ? new HttpParams().set('portfolioId', portfolioId) : undefined;
    return this.http.get<{ data: BrokerAccount[] }>(`${this.base}/broker-accounts`, { params });
  }
  createAccount(input: Record<string, unknown>) { return this.http.post<{ data: BrokerAccount }>(`${this.base}/broker-accounts`, input); }
  archiveAccount(id: string) { return this.http.delete(`${this.base}/broker-accounts/${id}`); }
  brokers() { return this.http.get<{ data: Broker[] }>(`${this.base}/reference/brokers`); }
  assets(search = '') { return this.http.get<{ data: Asset[] }>(`${this.base}/reference/assets`, { params: { search } }); }
  transactions(filters: Record<string, string> = {}) { return this.http.get<{ data: Transaction[]; pagination: { total: number } }>(`${this.base}/transactions`, { params: filters }); }
  createTransaction(input: Record<string, unknown>) { return this.http.post<{ data: Transaction }>(`${this.base}/transactions`, input); }
  deleteTransaction(id: string) { return this.http.delete(`${this.base}/transactions/${id}`); }
  imports() { return this.http.get<{ data: ImportBatch[] }>(`${this.base}/imports`); }
  importBatch(id: string) { return this.http.get<{ data: ImportBatch }>(`${this.base}/imports/${id}`); }
  uploadImport(data: FormData) { return this.http.post<{ data: ImportBatch }>(`${this.base}/imports/files`, data); }
  updateImportRow(id: string, data: Record<string, unknown>) { return this.http.patch<{ data: ImportRow }>(`${this.base}/import-rows/${id}`, data); }
  approveImportRow(id: string) { return this.http.post<{ data: ImportRow }>(`${this.base}/import-rows/${id}/approve`, {}); }
  rejectImportRow(id: string) { return this.http.post<{ data: ImportRow }>(`${this.base}/import-rows/${id}/reject`, {}); }
  confirmImport(id: string) { return this.http.post<{ data: { batch: ImportBatch; imported: number; duplicates: number } }>(`${this.base}/imports/${id}/confirm`, {}); }
  outlookStatus() { return this.http.get<{ data: OutlookConnectionStatus }>(`${this.base}/imports/outlook/status`); }
  connectOutlook() { return this.http.post<{ data: { url: string } }>(`${this.base}/imports/outlook/connect`, {}); }
  syncOutlook(lookbackMonths?: number) { return this.http.post<{ data: { scanned: number; matched: number; batches: number; duplicates: number; ignored: number; failed: number; passwordFailures: number; cleaned: number; truncated: boolean; from: string; lastSyncedAt: string } }>(`${this.base}/imports/outlook/sync`, lookbackMonths ? { lookbackMonths } : {}); }
  disconnectOutlook() { return this.http.delete<{ data: { disconnected: boolean } }>(`${this.base}/imports/outlook`); }
  xtbPasswordStatus() { return this.http.get<{ data: XtbPasswordStatus[] }>(`${this.base}/imports/xtb-password/status`); }
  saveXtbPassword(accountId: string, password: string) { return this.http.put<{ data: XtbPasswordStatus }>(`${this.base}/imports/xtb-password`, { accountId, password }); }
  removeXtbPassword(accountId: string) { return this.http.delete<{ data: { accountId: string; configured: false } }>(`${this.base}/imports/xtb-password/${accountId}`); }
}
