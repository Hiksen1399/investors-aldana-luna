import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MarketDataStore } from '../../state/market-data.store';
import { AssetPriceChart } from '../asset-price-chart/asset-price-chart';

@Component({ selector: 'app-position-live-table', imports: [CurrencyPipe, DatePipe, DecimalPipe, AssetPriceChart], templateUrl: './position-live-table.html', styleUrl: './position-live-table.scss' })
export class PositionLiveTable {
  readonly store = inject(MarketDataStore);
  readonly selectedAssetId = signal<string | null>(null);
  toggle(assetId: string) { this.selectedAssetId.set(this.selectedAssetId() === assetId ? null : assetId); }
}

