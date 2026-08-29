import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { BrokerAccount, Portfolio, Transaction } from '../../core/models';

@Component({selector:'app-transactions-page',imports:[CommonModule,ReactiveFormsModule],templateUrl:'./transactions-page.html',styleUrl:'./transactions-page.scss'})
export class TransactionsPage{
  private readonly api=inject(ApiService);private readonly fb=inject(FormBuilder);
  readonly transactions=signal<Transaction[]>([]);readonly accounts=signal<BrokerAccount[]>([]);readonly portfolios=signal<Portfolio[]>([]);readonly modal=signal(inject(ActivatedRoute).snapshot.queryParamMap.has('nuevo'));readonly loading=signal(true);readonly saving=signal(false);readonly error=signal('');readonly total=signal(0);readonly filterPortfolio=signal('');
  readonly types=[['TRADE','Compra / venta'],['DEPOSIT','Depósito'],['WITHDRAWAL','Retiro'],['DIVIDEND','Dividendo'],['INTEREST','Interés'],['FEE','Comisión'],['TAX','Impuesto'],['ADJUSTMENT','Ajuste']];
  readonly form=this.fb.nonNullable.group({accountId:['',Validators.required],type:['TRADE',Validators.required],side:['BUY'],tradeAt:[new Date().toISOString().slice(0,16),Validators.required],ticker:[''],assetName:[''],assetType:['STOCK'],quantity:[''],unitPrice:[''],grossAmount:[''],fees:['0'],taxes:['0'],currencyCode:['USD'],notes:['']});
  constructor(){this.loadReference();this.loadTransactions()}
  get isTrade(){return this.form.controls.type.value==='TRADE'}
  loadReference(){forkJoin({accounts:this.api.accounts(),portfolios:this.api.portfolios()}).subscribe(({accounts,portfolios})=>{this.accounts.set(accounts.data);this.portfolios.set(portfolios.data);if(accounts.data[0]&&!this.form.controls.accountId.value){this.form.controls.accountId.setValue(accounts.data[0].id);this.form.controls.currencyCode.setValue(accounts.data[0].currencyCode)}})}
  loadTransactions(){const filters:Record<string,string>=this.filterPortfolio()?{portfolioId:this.filterPortfolio()}:{};this.loading.set(true);this.api.transactions(filters).subscribe({next:r=>{this.transactions.set(r.data);this.total.set(r.pagination.total);this.loading.set(false)},error:()=>{this.error.set('No pudimos cargar las operaciones.');this.loading.set(false)}})}
  filter(event:Event){this.filterPortfolio.set((event.target as HTMLSelectElement).value);this.loadTransactions()}
  accountChanged(){const account=this.accounts().find(a=>a.id===this.form.controls.accountId.value);if(account)this.form.controls.currencyCode.setValue(account.currencyCode)}
  submit(){const v=this.form.getRawValue();if(this.form.invalid||this.isTrade&&(!v.ticker||!v.assetName||!v.quantity||!v.unitPrice)||!this.isTrade&&!v.grossAmount){this.form.markAllAsTouched();this.error.set('Completa los campos requeridos de la operación.');return}this.saving.set(true);this.error.set('');const payload:Record<string,unknown>={accountId:v.accountId,type:v.type,tradeAt:new Date(v.tradeAt).toISOString(),fees:v.fees||'0',taxes:v.taxes||'0',currencyCode:v.currencyCode,notes:v.notes||undefined};if(this.isTrade){Object.assign(payload,{side:v.side,asset:{ticker:v.ticker,name:v.assetName,type:v.assetType},quantity:v.quantity,unitPrice:v.unitPrice})}else{Object.assign(payload,{grossAmount:v.grossAmount,...(v.ticker?{asset:{ticker:v.ticker,name:v.assetName||v.ticker,type:v.assetType}}:{})})}this.api.createTransaction(payload).subscribe({next:()=>{this.modal.set(false);this.saving.set(false);this.resetForm();this.loadTransactions()},error:e=>{this.error.set(e.error?.error?.message??'No pudimos registrar la operación.');this.saving.set(false)}})}
  remove(item:Transaction){if(confirm('¿Eliminar esta operación? Los cálculos FIFO se reconstruirán.'))this.api.deleteTransaction(item.id).subscribe({next:()=>this.loadTransactions(),error:e=>this.error.set(e.error?.error?.message??'No pudimos eliminarla.')})}
  label(type:string,side?:string){if(type==='TRADE')return side==='BUY'?'Compra':'Venta';return ({DEPOSIT:'Depósito',WITHDRAWAL:'Retiro',DIVIDEND:'Dividendo',INTEREST:'Interés',FEE:'Comisión',TAX:'Impuesto',ADJUSTMENT:'Ajuste'} as Record<string,string>)[type]||type}
  amount(item:Transaction){return new Intl.NumberFormat('es-CO',{style:'currency',currency:item.currencyCode}).format(Number(item.grossAmount))}
  private resetForm(){const account=this.accounts()[0];this.form.reset({accountId:account?.id||'',type:'TRADE',side:'BUY',tradeAt:new Date().toISOString().slice(0,16),ticker:'',assetName:'',assetType:'STOCK',quantity:'',unitPrice:'',grossAmount:'',fees:'0',taxes:'0',currencyCode:account?.currencyCode||'USD',notes:''})}
}
