import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import * as echarts from 'echarts';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { BrokerAccount, DashboardSummary, HistoryPoint, Portfolio } from '../../core/models';
import { PortfolioLiveSummary } from '../market-data/components/portfolio-live-summary/portfolio-live-summary';
import { PositionLiveTable } from '../market-data/components/position-live-table/position-live-table';
import { MarketDataStore } from '../market-data/state/market-data.store';

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, RouterLink, PortfolioLiveSummary, PositionLiveTable],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly liveMarket = inject(MarketDataStore);
  @ViewChild('historyChart') chartElement?: ElementRef<HTMLDivElement>;
  private chart?: echarts.ECharts;
  readonly portfolios = signal<Portfolio[]>([]);
  readonly accounts = signal<BrokerAccount[]>([]);
  readonly selectedPortfolioId = signal('');
  readonly selectedAccountId = signal('');
  readonly summary = signal<DashboardSummary | null>(null);
  readonly history = signal<HistoryPoint[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly privacy = signal(false);
  readonly range = signal('1A');
  readonly ranges = ['1M', '3M', '6M', '1A', '5A', 'Todo'];
  private readonly resize = () => this.chart?.resize();

  constructor() {
    this.api.portfolios().subscribe({
      next: ({ data }) => {
        this.portfolios.set(data);
        if (data[0]) { this.selectedPortfolioId.set(data[0].id); this.loadDashboard(); }
        else this.loading.set(false);
      },
      error: () => { this.error.set('No pudimos cargar tus portafolios. Verifica que la API esté disponible.'); this.loading.set(false); },
    });
  }

  ngAfterViewInit() { window.addEventListener('resize', this.resize); }
  ngOnDestroy() { window.removeEventListener('resize', this.resize); this.chart?.dispose(); this.liveMarket.stop(); }

  selectPortfolio(event: Event) { this.selectedPortfolioId.set((event.target as HTMLSelectElement).value); this.selectedAccountId.set(''); this.loadDashboard(); }
  selectAccount(event: Event) { this.selectedAccountId.set((event.target as HTMLSelectElement).value); this.loadSummary(); }
  chooseRange(value: string) { this.range.set(value); this.renderChart(); }

  money(value = 0) {
    if (this.privacy()) return '••••••';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: this.summary()?.portfolio.currency ?? 'USD', minimumFractionDigits: 2 }).format(value);
  }
  percent(value = 0) { return `${value >= 0 ? '+' : ''}${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)} %`; }

  allocationGradient() {
    const positions = (this.summary()?.positions ?? []).slice(0, 4);
    if (!positions.length) return 'conic-gradient(#263547 0 100%)';
    const colors = ['#8b5cf6', '#20c8e8', '#35d07f', '#ffb91f'];
    let cursor = 0;
    const stops = positions.map((position, index) => {
      const start = cursor;
      cursor = Math.min(100, cursor + Math.max(position.weight, 0));
      return `${colors[index]} ${start}% ${cursor}%`;
    });
    if (cursor < 100) stops.push(`#263547 ${cursor}% 100%`);
    return `conic-gradient(${stops.join(',')})`;
  }

  private loadDashboard() {
    this.loading.set(true); this.error.set('');
    this.liveMarket.start(this.selectedPortfolioId());
    forkJoin({ accounts: this.api.accounts(this.selectedPortfolioId()), history: this.api.history(this.selectedPortfolioId()) }).subscribe({
      next: ({ accounts, history }) => { this.accounts.set(accounts.data); this.history.set(history.data); this.loadSummary(); },
      error: () => { this.error.set('No pudimos actualizar el resumen.'); this.loading.set(false); },
    });
  }

  private loadSummary() {
    this.loading.set(true);
    this.api.summary(this.selectedPortfolioId(), this.selectedAccountId() || undefined).subscribe({
      next: ({ data }) => { this.summary.set(data); this.loading.set(false); queueMicrotask(() => this.renderChart()); },
      error: () => { this.error.set('No pudimos calcular el portafolio.'); this.loading.set(false); },
    });
  }

  private renderChart() {
    if (!this.chartElement) return;
    if (!this.chart) this.chart = echarts.init(this.chartElement.nativeElement);
    const points = this.filteredHistory();
    this.chart.setOption({
      animationDuration: 700,
      grid: { left: 12, right: 18, top: 25, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', backgroundColor: '#0c1723', borderColor: 'rgba(139,92,246,.38)', borderWidth: 1, textStyle: { color: '#e9edf2', fontFamily: 'Inter', fontSize: 10 }, valueFormatter: (value: unknown) => this.money(Number(value)) },
      xAxis: { type: 'category', boundaryGap: false, data: points.map((p) => new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' }).format(new Date(p.date))), axisLine: { lineStyle: { color: '#253344' } }, axisTick: { show: false }, axisLabel: { color: '#687789', fontSize: 9 } },
      yAxis: { type: 'value', axisLabel: { color: '#687789', fontSize: 9, formatter: (v: number) => `$${Math.round(v / 1000)}k` }, splitLine: { lineStyle: { color: 'rgba(130,160,191,.13)', type: 'dashed' } } },
      series: [
        { name: 'Valor del portafolio', type: 'line', smooth: .35, symbol: 'none', data: points.map((p) => p.portfolioValue), lineStyle: { width: 2.2, color: '#8b5cf6', shadowColor: 'rgba(139,92,246,.35)', shadowBlur: 8 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(32,200,232,.30)' }, { offset: .55, color: 'rgba(24,113,151,.13)' }, { offset: 1, color: 'rgba(5,11,18,0)' }]) } },
        { name: 'Capital aportado', type: 'line', smooth: true, symbol: 'none', data: points.map((p) => p.contributed), lineStyle: { width: 1.2, color: '#667587', type: 'dashed' } },
      ],
    });
  }

  private filteredHistory() {
    const months: Record<string, number> = { '1M': 1, '3M': 3, '6M': 6, '1A': 12, '5A': 60, 'Todo': 9999 };
    return this.history().slice(-months[this.range()]!);
  }
}
