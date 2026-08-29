import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { catchError, switchMap, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authorizedRequest = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authorizedRequest).pipe(catchError((error) => {
    if (error.status !== 401 || req.url.includes('/auth/refresh') || req.url.includes('/auth/login')) {
      return throwError(() => error);
    }
    return auth.refresh().pipe(switchMap((refreshed) => {
      const nextToken = auth.token();
      if (!refreshed || !nextToken) return throwError(() => error);
      return next(req.clone({ setHeaders: { Authorization: `Bearer ${nextToken}` } }));
    }));
  }));
};
