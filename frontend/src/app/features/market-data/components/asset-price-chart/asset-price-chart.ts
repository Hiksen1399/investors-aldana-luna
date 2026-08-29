import { Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, AfterViewInit, inject, signal } from '@angular/core';
import { CandlestickSeries, ColorType, createChart, CrosshairMode, HistogramSeries, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import { MarketDataService } from '../../services/market-data.service';

@Component({ selector: 'app-asset-price-chart', templateUrl: './asset-price-chart.html', styleUrl: './asset-price-chart.scss' })
export class AssetPriceChart implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) assetId = '';
  @Input({ required: true }) symbol = '';
  @ViewChild('chartHost') host?: ElementRef<HTMLDivElement>;
  private readonly api = inject(MarketDataService);
  private chart?: IChartApi;
  private candles?: ISeriesApi<'Candlestick'>;
  private volume?: ISeriesApi<'Histogram'>;
  private resizeObserver?: ResizeObserver;
  readonly range = signal('1A');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly tooltip = signal('');
  readonly ranges = ['1M','3M','6M','1A','5A','Todo'];

  ngAfterViewInit() { this.create(); this.load(); }
  ngOnChanges() { if (this.chart) this.load(); }
  ngOnDestroy() { this.resizeObserver?.disconnect(); this.chart?.remove(); }
  selectRange(range: string) { this.range.set(range); this.load(); }

  private create() {
    if (!this.host) return;
    this.chart = createChart(this.host.nativeElement, {
      height: 310,
      layout: { background: { type: ColorType.Solid, color: '#06101a' }, textColor: '#6f7e90', fontFamily: 'Inter', fontSize: 10 },
      grid: { vertLines: { color: 'rgba(130,160,191,.08)' }, horzLines: { color: 'rgba(130,160,191,.10)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#263547', scaleMargins: { top: .08, bottom: .25 } },
      timeScale: { borderColor: '#263547', timeVisible: true },
    });
    this.candles = this.chart.addSeries(CandlestickSeries, { upColor: '#35d07f', downColor: '#ff6b7a', borderVisible: false, wickUpColor: '#35d07f', wickDownColor: '#ff6b7a' });
    this.volume = this.chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    this.chart.priceScale('volume').applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
    this.chart.subscribeCrosshairMove((param) => {
      if (!param.time || !this.candles) { this.tooltip.set(''); return; }
      const value = param.seriesData.get(this.candles) as { close?: number } | undefined;
      this.tooltip.set(value?.close == null ? '' : `${this.formatTime(param.time)} · ${value.close.toLocaleString('es-CO', { maximumFractionDigits: 4 })}`);
    });
    this.resizeObserver = new ResizeObserver(([entry]) => this.chart?.applyOptions({ width: entry?.contentRect.width ?? 600 }));
    this.resizeObserver.observe(this.host.nativeElement);
  }

  private load() {
    if (!this.assetId || !this.candles || !this.volume) return;
    const { from, to } = this.dateRange();
    this.loading.set(true); this.error.set('');
    this.api.history(this.assetId, '1day', from, to).subscribe({
      next: ({ data }) => {
        this.candles!.setData(data.map((item) => ({ time: item.priceDatetime.slice(0, 10) as Time, open: item.open, high: item.high, low: item.low, close: item.close })));
        this.volume!.setData(data.filter((item) => item.volume != null).map((item) => ({ time: item.priceDatetime.slice(0, 10) as Time, value: item.volume!, color: item.close >= item.open ? 'rgba(53,208,127,.28)' : 'rgba(255,107,122,.25)' })));
        this.chart?.timeScale().fitContent(); this.loading.set(false);
      },
      error: (error) => { this.error.set(error.error?.error?.message ?? 'No pudimos cargar el historial.'); this.loading.set(false); },
    });
  }

  private dateRange() {
    const to = new Date();
    const from = new Date(to);
    const months: Record<string, number> = { '1M': 1, '3M': 3, '6M': 6, '1A': 12, '5A': 60, 'Todo': 120 };
    from.setUTCMonth(from.getUTCMonth() - months[this.range()]!);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }

  private formatTime(time: Time) {
    if (typeof time === 'string') return time;
    if (typeof time === 'number') return new Date((time as UTCTimestamp) * 1000).toISOString().slice(0,10);
    return `${time.year}-${String(time.month).padStart(2,'0')}-${String(time.day).padStart(2,'0')}`;
  }
}

