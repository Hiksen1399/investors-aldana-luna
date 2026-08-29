import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import type { Portfolio } from '../../core/models';

@Component({ selector: 'app-portfolios-page', imports: [ReactiveFormsModule], templateUrl: './portfolios-page.html', styleUrl: './portfolios-page.scss' })
export class PortfoliosPage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  readonly portfolios = signal<Portfolio[]>([]);
  readonly loading = signal(true);
  readonly modal = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.minLength(2)]], objective: [''], description: [''], baseCurrencyCode: ['USD', Validators.required] });
  constructor() { this.load(); }
  load() { this.api.portfolios().subscribe({ next: ({ data }) => { this.portfolios.set(data); this.loading.set(false); }, error: () => { this.error.set('No pudimos cargar los portafolios.'); this.loading.set(false); } }); }
  create() { if (this.form.invalid) return; this.saving.set(true); this.api.createPortfolio(this.form.getRawValue()).subscribe({ next: () => { this.modal.set(false); this.saving.set(false); this.form.reset({ name: '', objective: '', description: '', baseCurrencyCode: 'USD' }); this.load(); }, error: (e) => { this.error.set(e.error?.error?.message ?? 'No fue posible guardar.'); this.saving.set(false); } }); }
  archive(portfolio: Portfolio) { if (!confirm(`¿Archivar “${portfolio.name}”?`)) return; this.api.archivePortfolio(portfolio.id).subscribe(() => this.load()); }
}

