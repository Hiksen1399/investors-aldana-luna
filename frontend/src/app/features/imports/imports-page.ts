import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { BrokerAccount, ImportBatch, ImportRow, OutlookConnectionStatus, XtbPasswordStatus } from '../../core/models';

@Component({ selector: 'app-imports-page', imports: [CommonModule, FormsModule], templateUrl: './imports-page.html', styleUrl: './imports-page.scss' })
export class ImportsPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  readonly imports = signal<ImportBatch[]>([]);
  readonly accounts = signal<BrokerAccount[]>([]);
  readonly selectedBatch = signal<ImportBatch | null>(null);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly confirming = signal(false);
  readonly connectingOutlook = signal(false);
  readonly syncingOutlook = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly outlook = signal<OutlookConnectionStatus>({ configured: false, connected: false, email: null, lastSyncedAt: null });
  readonly xtbPasswords = signal<XtbPasswordStatus[]>([]);
  readonly savingXtbPassword = signal(false);
  selectedFile?: File;
  selectedAccountId = '';
  broker: 'HAPI' | 'XTB' = 'HAPI';
  documentPassword = '';
  outlookLookbackMonths = 12;
  xtbAccountId = '';
  xtbPassword = '';

  private callbackHandled = false;

  constructor() { this.load(); }

  load() {
    forkJoin({ imports: this.api.imports(), accounts: this.api.accounts(), outlook: this.api.outlookStatus(), xtbPasswords: this.api.xtbPasswordStatus() }).subscribe({
      next: ({ imports, accounts, outlook, xtbPasswords }) => {
        this.imports.set(imports.data); this.accounts.set(accounts.data); this.outlook.set(outlook.data); this.xtbPasswords.set(xtbPasswords.data);
        if (!this.selectedAccountId && accounts.data[0]) this.selectedAccountId = accounts.data[0].id;
        if (!this.xtbAccountId) this.xtbAccountId = accounts.data.find((account) => account.broker.slug.toLowerCase() === 'xtb')?.id ?? '';
        this.loading.set(false);
        const callback = this.route.snapshot.queryParamMap.get('outlook');
        if (!this.callbackHandled && callback) {
          this.callbackHandled = true;
          if (callback === 'connected') { this.success.set('Outlook quedó conectado. Buscando confirmaciones de Hapi y XTB…'); this.syncOutlook(); }
          else if (callback === 'denied') this.error.set('La autorización de Outlook fue cancelada.');
          else this.error.set('No pudimos completar la conexión con Outlook. Revisa la configuración de Microsoft.');
        }
      },
      error: () => { this.error.set('No pudimos cargar el módulo de importaciones.'); this.loading.set(false); },
    });
  }

  chooseFile() { this.fileInput?.nativeElement.click(); }
  fileSelected(event: Event) { this.selectedFile = (event.target as HTMLInputElement).files?.[0]; this.error.set(''); }

  upload() {
    if (!this.selectedFile) { this.error.set('Selecciona un archivo EML, PDF, CSV o TXT.'); return; }
    if (!this.selectedAccountId) { this.error.set('Primero asocia una cuenta Hapi o XTB.'); return; }
    const data = new FormData();
    data.append('file', this.selectedFile);
    data.append('broker', this.broker);
    data.append('accountId', this.selectedAccountId);
    if (this.documentPassword) data.append('documentPassword', this.documentPassword);
    this.uploading.set(true); this.error.set(''); this.success.set('');
    this.api.uploadImport(data).subscribe({
      next: ({ data: batch }) => {
        this.uploading.set(false); this.selectedBatch.set(batch); this.success.set(batch.duplicateBatch ? 'Este archivo ya había sido procesado. Abrimos su resultado anterior.' : `Detectamos ${batch.totalRows} operación(es). Revisa y confirma.`); this.documentPassword = ''; this.load();
      },
      error: (error) => { this.uploading.set(false); this.error.set(error.error?.error?.message ?? 'No pudimos procesar el archivo.'); },
    });
  }

  openBatch(id: string) {
    this.api.importBatch(id).subscribe({ next: ({ data }) => { this.selectedBatch.set(data); queueMicrotask(() => document.querySelector('.review-panel')?.scrollIntoView({ behavior: 'smooth' })); }, error: () => this.error.set('No pudimos abrir la importación.') });
  }

  saveAndApprove(row: ImportRow) {
    const value = row.normalizedData;
    const symbol = String(value['symbol'] || value['sourceSymbol'] || '').trim().toUpperCase();
    const payload = {
      accountId: value['accountId'] || this.selectedAccountId,
      externalAccountNumber: value['externalAccountNumber'] || undefined,
      externalOrderId: value['externalOrderId'] || undefined,
      sourceSymbol: symbol, symbol, providerSymbol: symbol, assetName: symbol, assetType: value['assetType'] || 'STOCK', exchange: value['exchange'] || undefined,
      side: value['side'], quantity: String(value['quantity']), unitPrice: String(value['unitPrice']), grossAmount: String(value['grossAmount'] || Number(value['quantity']) * Number(value['unitPrice'])), fees: String(value['fees'] || 0), taxes: String(value['taxes'] || 0), currencyCode: value['currencyCode'] || 'USD', exchangeRate: String(value['exchangeRate'] || 1), executedAt: value['executedAt'],
    };
    this.api.updateImportRow(row.id, payload).subscribe({ next: () => this.refreshSelected(), error: (error) => this.error.set(error.error?.error?.message ?? 'Revisa los campos antes de aprobar.') });
  }

  reject(row: ImportRow) { this.api.rejectImportRow(row.id).subscribe({ next: () => this.refreshSelected(), error: () => this.error.set('No pudimos rechazar la fila.') }); }

  confirm() {
    const batch = this.selectedBatch();
    if (!batch) return;
    this.confirming.set(true); this.error.set('');
    this.api.confirmImport(batch.id).subscribe({
      next: ({ data }) => { this.confirming.set(false); this.selectedBatch.set(data.batch); this.success.set(`${data.imported} operación(es) registradas; ${data.duplicates} duplicadas.`); this.load(); },
      error: (error) => { this.confirming.set(false); this.error.set(error.error?.error?.message ?? 'No pudimos confirmar la importación.'); },
    });
  }

  connectOutlook() {
    this.connectingOutlook.set(true); this.error.set('');
    this.api.connectOutlook().subscribe({
      next: ({ data }) => window.location.assign(data.url),
      error: (error) => { this.connectingOutlook.set(false); this.error.set(error.error?.error?.message ?? 'No pudimos iniciar la conexión con Outlook.'); },
    });
  }

  syncOutlook() {
    if (!this.outlook().connected || this.syncingOutlook()) return;
    this.syncingOutlook.set(true); this.error.set('');
    this.api.syncOutlook(this.outlookLookbackMonths).subscribe({
      next: ({ data }) => {
        this.syncingOutlook.set(false);
        const cleanup = data.cleaned ? ` Quitamos ${data.cleaned} correo(s) que no eran operaciones.` : '';
        this.success.set((data.batches ? `Encontramos ${data.batches} confirmación(es) con operaciones.` : 'No encontramos operaciones nuevas en el período seleccionado.') + cleanup);
        if (data.passwordFailures) this.error.set(`${data.passwordFailures} PDF de XTB no pudieron abrirse. Verifica la contraseña cifrada de la cuenta.`);
        else if (data.failed) this.error.set(`${data.failed} correo(s) no pudieron procesarse.`);
        if (data.truncated) this.error.set('La búsqueda alcanzó el límite de 5.000 mensajes. Selecciona un período más corto para completar el historial.');
        this.load();
      },
      error: (error) => { this.syncingOutlook.set(false); this.error.set(error.error?.error?.message ?? 'No pudimos sincronizar Outlook.'); },
    });
  }

  disconnectOutlook() {
    this.api.disconnectOutlook().subscribe({ next: () => { this.outlook.set({ configured: true, connected: false, email: null, lastSyncedAt: null }); this.success.set('La cuenta de Outlook fue desconectada.'); }, error: () => this.error.set('No pudimos desconectar Outlook.') });
  }

  saveXtbPassword() {
    if (!this.xtbAccountId || !this.xtbPassword) { this.error.set('Selecciona una cuenta XTB y escribe la contraseña del PDF.'); return; }
    this.savingXtbPassword.set(true); this.error.set(''); this.success.set('');
    this.api.saveXtbPassword(this.xtbAccountId, this.xtbPassword).subscribe({
      next: () => {
        this.savingXtbPassword.set(false); this.xtbPassword = '';
        this.success.set('Contraseña XTB guardada cifrada. Reintentaremos las confirmaciones del período seleccionado.');
        this.load();
        if (this.outlook().connected) this.syncOutlook();
      },
      error: (error) => { this.savingXtbPassword.set(false); this.error.set(error.error?.error?.message ?? 'No pudimos guardar la contraseña XTB.'); },
    });
  }

  removeXtbPassword() {
    if (!this.xtbAccountId) return;
    this.api.removeXtbPassword(this.xtbAccountId).subscribe({
      next: () => { this.xtbPassword = ''; this.success.set('La contraseña cifrada de XTB fue eliminada.'); this.load(); },
      error: () => this.error.set('No pudimos eliminar la contraseña XTB.'),
    });
  }

  selectedXtbPasswordStatus() { return this.xtbPasswords().find((status) => status.accountId === this.xtbAccountId); }

  statusLabel(status: string) { return ({ PROCESSING: 'Procesando', NEEDS_REVIEW: 'Requiere revisión', COMPLETED: 'Completada', FAILED: 'Fallida', APPROVED: 'Aprobada', PENDING: 'Pendiente', DUPLICATE: 'Duplicada', REJECTED: 'Rechazada', ERROR: 'Con error' } as Record<string,string>)[status] ?? status; }
  canEdit(row: ImportRow) { return !row.transaction && !['DUPLICATE','REJECTED'].includes(row.status); }
  approvedCount() { return this.selectedBatch()?.rows?.filter((row) => row.status === 'APPROVED' && !row.transaction).length ?? 0; }

  private refreshSelected() { const id = this.selectedBatch()?.id; if (id) this.api.importBatch(id).subscribe(({ data }) => this.selectedBatch.set(data)); }
}
