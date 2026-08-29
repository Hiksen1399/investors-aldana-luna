import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { Broker, BrokerAccount, Portfolio } from '../../core/models';

@Component({ selector: 'app-accounts-page', imports: [ReactiveFormsModule], templateUrl: './accounts-page.html', styleUrl: './accounts-page.scss' })
export class AccountsPage {
  private readonly api=inject(ApiService);private readonly fb=inject(FormBuilder);
  readonly accounts=signal<BrokerAccount[]>([]);readonly portfolios=signal<Portfolio[]>([]);readonly brokers=signal<Broker[]>([]);readonly modal=signal(false);readonly loading=signal(true);readonly saving=signal(false);readonly error=signal('');
  readonly form=this.fb.nonNullable.group({portfolioId:['',Validators.required],brokerId:['',Validators.required],name:['',Validators.required],externalAccountNumber:[''],objective:[''],currencyCode:['USD',Validators.required],autoImportEnabled:[false]});
  constructor(){this.load();}
  load(){forkJoin({accounts:this.api.accounts(),portfolios:this.api.portfolios(),brokers:this.api.brokers()}).subscribe({next:r=>{this.accounts.set(r.accounts.data);this.portfolios.set(r.portfolios.data);this.brokers.set(r.brokers.data);if(!this.form.controls.portfolioId.value&&r.portfolios.data[0])this.form.controls.portfolioId.setValue(r.portfolios.data[0].id);if(!this.form.controls.brokerId.value&&r.brokers.data[0])this.form.controls.brokerId.setValue(r.brokers.data[0].id);this.loading.set(false)},error:()=>{this.error.set('No pudimos cargar las cuentas.');this.loading.set(false)}})}
  create(){if(this.form.invalid){this.form.markAllAsTouched();return}this.saving.set(true);this.api.createAccount(this.form.getRawValue()).subscribe({next:()=>{this.modal.set(false);this.saving.set(false);this.load()},error:e=>{this.error.set(e.error?.error?.message??'No fue posible crear la cuenta.');this.saving.set(false)}})}
  archive(account:BrokerAccount){if(confirm(`¿Archivar “${account.name}”?`))this.api.archiveAccount(account.id).subscribe(()=>this.load())}
}

