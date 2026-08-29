import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage), data: { mode: 'login' } },
  { path: 'registro', loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage), data: { mode: 'register' } },
  {
    path: 'app', canActivate: [authGuard], loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage) },
      { path: 'portafolios', loadComponent: () => import('./features/portfolios/portfolios-page').then((m) => m.PortfoliosPage) },
      { path: 'cuentas', loadComponent: () => import('./features/accounts/accounts-page').then((m) => m.AccountsPage) },
      { path: 'operaciones', loadComponent: () => import('./features/transactions/transactions-page').then((m) => m.TransactionsPage) },
      { path: 'importaciones', loadComponent: () => import('./features/imports/imports-page').then((m) => m.ImportsPage) },
      { path: 'bitacora', loadComponent: () => import('./features/journal/journal-page').then((m) => m.JournalPage) },
      { path: 'configuracion', loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage) },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  { path: '**', redirectTo: 'app/dashboard' },
];
