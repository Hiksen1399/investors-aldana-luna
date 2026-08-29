import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenState = signal<string | null>(sessionStorage.getItem('accessToken'));
  readonly user = signal<User | null>(null);
  readonly token = this.tokenState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.tokenState()));
  private refreshRequest?: Observable<boolean>;

  login(input: { email: string; password: string }) {
    return this.http.post<{ user: User; accessToken: string }>(`${environment.apiUrl}/auth/login`, input, { withCredentials: true }).pipe(
      tap((result) => this.setSession(result.accessToken, result.user)),
    );
  }

  register(input: { fullName: string; email: string; password: string; timezone: string }) {
    return this.http.post<{ user: User; accessToken: string }>(`${environment.apiUrl}/auth/register`, input, { withCredentials: true }).pipe(
      tap((result) => this.setSession(result.accessToken, result.user)),
    );
  }

  ensureSession(): Observable<boolean> {
    if (this.tokenState()) {
      if (!this.user()) this.loadMe().subscribe();
      return of(true);
    }
    return this.refresh();
  }

  refresh(): Observable<boolean> {
    if (this.refreshRequest) return this.refreshRequest;
    this.refreshRequest = this.http.post<{ accessToken: string }>(`${environment.apiUrl}/auth/refresh`, {}, { withCredentials: true }).pipe(
      tap(({ accessToken }) => this.setToken(accessToken)),
      map(() => true),
      catchError(() => { this.clearSession(); return of(false); }),
      finalize(() => { this.refreshRequest = undefined; }),
    );
    return this.refreshRequest;
  }

  loadMe() {
    return this.http.get<{ data: User }>(`${environment.apiUrl}/auth/me`).pipe(tap(({ data }) => this.user.set(data)));
  }

  logout() {
    this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true }).pipe(finalize(() => {
      this.clearSession();
      void this.router.navigate(['/login']);
    })).subscribe();
  }

  setToken(token: string) { this.tokenState.set(token); sessionStorage.setItem('accessToken', token); }
  clearSession() { this.tokenState.set(null); this.user.set(null); sessionStorage.removeItem('accessToken'); }
  private setSession(token: string, user: User) { this.setToken(token); this.user.set(user); }
}

