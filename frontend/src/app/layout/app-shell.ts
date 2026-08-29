import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly menuOpen = signal(false);
  readonly today = new Date();
  readonly currentTitle = signal('Resumen');
  readonly nav = [
    { path: '/app/dashboard', icon: 'bi bi-grid-1x2', label: 'Resumen' },
    { path: '/app/portafolios', icon: 'bi bi-pie-chart', label: 'Inversiones' },
    { path: '/app/cuentas', icon: 'bi bi-wallet2', label: 'Cuentas' },
    { path: '/app/operaciones', icon: 'bi bi-arrow-down-up', label: 'Movimientos' },
    { path: '/app/importaciones', icon: 'bi bi-cloud-arrow-down', label: 'Importaciones' },
    { path: '/app/bitacora', icon: 'bi bi-bar-chart-line', label: 'Análisis' },
  ];
  constructor() {
    const titles: Record<string, string> = { dashboard: 'Resumen', portafolios: 'Inversiones', cuentas: 'Cuentas', operaciones: 'Movimientos', importaciones: 'Importaciones', bitacora: 'Análisis', configuracion: 'Configuración' };
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      const segment = event.urlAfterRedirects.split('?')[0].split('/').filter(Boolean).at(-1) ?? 'dashboard';
      this.currentTitle.set(titles[segment] ?? 'Mi Portafolio');
    });
  }
  reload() { location.reload(); }
}
