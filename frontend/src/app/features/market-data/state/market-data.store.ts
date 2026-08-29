import { computed, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MarketDataService } from '../services/market-data.service';
import type { LivePortfolioSummary } from '../models/market-data.models';

@Injectable({ providedIn: 'root' })
export class MarketDataStore {
  private readonly api = inject(MarketDataService);
  private readonly summaryState = signal<LivePortfolioSummary | null>(null);
  private readonly loadingState = signal(false);
  private readonly refreshingState = signal(false);
  private readonly errorState = signal('');
  private portfolioId = '';
  private timer?: ReturnType<typeof setInterval>;
  private request?: Subscription;

  readonly summary = this.summaryState.asReadonly();
  readonly positions = computed(() => this.summaryState()?.positions ?? []);
  readonly loading = this.loadingState.asReadonly();
  readonly refreshing = this.refreshingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly updatedAt = computed(() => this.summaryState()?.updatedAt ?? null);
  readonly stale = computed(() => this.summaryState()?.stale ?? false);

  start(portfolioId: string) {
    if (!portfolioId) return;
    if (this.portfolioId !== portfolioId) {
      this.stop();
      this.portfolioId = portfolioId;
      this.summaryState.set(null);
      this.loadingState.set(true);
    }
    this.refresh();
    if (!this.timer) this.timer = setInterval(() => this.refresh(), 60_000);
  }

  refresh() {
    if (!this.portfolioId || this.refreshingState()) return;
    this.refreshingState.set(true);
    this.errorState.set('');
    this.request = this.api.liveSummary(this.portfolioId).subscribe({
      next: ({ data }) => { this.summaryState.set(data); this.loadingState.set(false); this.refreshingState.set(false); },
      error: (error) => {
        this.errorState.set(error.error?.error?.message ?? 'No pudimos actualizar el precio. Mostrando el último valor disponible.');
        this.loadingState.set(false);
        this.refreshingState.set(false);
      },
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.request?.unsubscribe();
    this.request = undefined;
    this.refreshingState.set(false);
  }
}

