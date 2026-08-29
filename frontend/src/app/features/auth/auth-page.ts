import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-auth-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
})
export class AuthPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly mode = inject(ActivatedRoute).snapshot.data['mode'] as 'login' | 'register';
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);
  readonly form = this.fb.nonNullable.group({
    fullName: ['', this.mode === 'register' ? [Validators.required, Validators.minLength(2)] : []],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(this.mode === 'register' ? 10 : 1)]],
  });

  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true); this.error.set('');
    const value = this.form.getRawValue();
    const request = this.mode === 'login'
      ? this.auth.login({ email: value.email, password: value.password })
      : this.auth.register({ ...value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota' });
    request.subscribe({
      next: () => void this.router.navigate(['/app/dashboard']),
      error: (error) => { this.error.set(error.error?.error?.message ?? 'No pudimos completar la solicitud.'); this.loading.set(false); },
    });
  }
}

