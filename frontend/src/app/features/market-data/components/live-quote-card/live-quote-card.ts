import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import type { MarketQuote } from '../../models/market-data.models';

@Component({ selector: 'app-live-quote-card', imports: [CurrencyPipe, DatePipe, DecimalPipe], templateUrl: './live-quote-card.html', styleUrl: './live-quote-card.scss' })
export class LiveQuoteCard {
  readonly quote = input.required<MarketQuote>();
}

