import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, of, switchMap, tap, throwError } from 'rxjs';

export interface Account { name: string; email: string; role: string; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly account = signal<Account | null>(null);

  load() {
    return this.http.get<Account>('/api/auth/me').pipe(
      tap(account => this.account.set(account)),
      map(() => true),
      catchError(() => { this.account.set(null); return of(false); })
    );
  }
}

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const http = inject(HttpClient);
  const auth = inject(AuthService);
  const authenticated = request.clone({ withCredentials: true });
  const result = ['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ? next(authenticated)
    : http.get<{ token: string }>('/api/auth/csrf').pipe(
        switchMap(csrf => next(authenticated.clone({ setHeaders: { 'X-CSRF-TOKEN': csrf.token } })))
      );
  return result.pipe(catchError(error => {
    if (error.status === 401 && request.url !== '/api/auth/login') {
      auth.account.set(null);
      if (window.location.pathname !== '/') window.location.assign('/');
    }
    return throwError(() => error);
  }));
};
