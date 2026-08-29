import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MarketDataStore } from '../../state/market-data.store';

@Component({ selector: 'app-portfolio-live-summary', imports: [CurrencyPipe, DatePipe, DecimalPipe], templateUrl: './portfolio-live-summary.html', styleUrl: './portfolio-live-summary.scss' })
export class PortfolioLiveSummary {
  readonly store = inject(MarketDataStore);
}

