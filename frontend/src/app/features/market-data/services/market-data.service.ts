import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import type { HistoricalMarketPrice, LivePortfolioSummary, MarketQuote } from '../models/market-data.models';

@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  quote(assetId: string) {
    return this.http.get<{ data: MarketQuote }>(`${this.base}/market-data/assets/${assetId}/quote`);
  }

  quotes(assetIds: string[]) {
    return this.http.get<{ data: MarketQuote[] }>(`${this.base}/market-data/quotes`, { params: { assetIds: assetIds.join(',') } });
  }

  history(assetId: string, interval: string, from: string, to: string) {
    const params = new HttpParams().set('interval', interval).set('from', from).set('to', to);
    return this.http.get<{ data: HistoricalMarketPrice[] }>(`${this.base}/market-data/assets/${assetId}/history`, { params });
  }

  liveSummary(portfolioId: string) {
    return this.http.get<{ data: LivePortfolioSummary }>(`${this.base}/portfolios/${portfolioId}/live-summary`);
  }
}

