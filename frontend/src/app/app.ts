import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterOutlet } from '@angular/router';

import { finalize, timeout } from 'rxjs';

import { VoiceComponent } from './voice';
import { AuthService } from './auth.service';

interface LoginResponse {
  name: string;
  email: string;
  role: string;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule, RouterOutlet, VoiceComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly backendMessage = signal('Connecting to the backend...');
  protected readonly authMode = signal<'login' | 'register' | null>(null);
  protected readonly auth = inject(AuthService);
  protected readonly loggedIn = computed(() => this.auth.account() !== null);
  protected readonly accountCreated = signal(false);
  protected readonly authMessage = signal('');
  protected readonly authError = signal('');
  protected readonly registering = signal(false);
  protected accountName = '';
  protected accountEmail = '';
  protected accountPassword = '';
  protected loginEmail = '';
  protected loginPassword = '';
  protected readonly loginSubmitted = signal(false);

  constructor(private readonly http: HttpClient, private readonly router: Router) {
    http.get('/api/health', { responseType: 'text' }).subscribe({
      next: (message) => this.backendMessage.set(message),
      error: () => this.backendMessage.set('Backend unavailable. Start Spring Boot on port 8080.')
    });
  }

  private apiErrorMessage(error: { error?: unknown }, fallback: string): string {
    if (typeof error.error === 'string') {
      return error.error;
    }
    if (error.error && typeof error.error === 'object' && 'message' in error.error) {
      return String(error.error.message);
    }
    return fallback;
  }

  protected openAuth(mode: 'login' | 'register'): void {
    this.authMode.set(mode);
    this.accountCreated.set(false);
    this.loginSubmitted.set(false);
    this.authMessage.set('');
    this.authError.set('');
  }

  protected createAccount(form: NgForm): void {
    if (this.registering()) return;
    this.authMessage.set('');
    this.authError.set('');
    form.form.markAllAsTouched();
    if (!this.accountName.trim()) {
      this.authError.set('Please enter your name.');
      return;
    }
    if (!this.accountEmail.trim() || form.controls['email']?.invalid) {
      this.authError.set('Please enter a valid email address.');
      return;
    }
    if (!this.accountPassword.trim()) {
      this.authError.set('Please enter a password.');
      return;
    }
    if (form.invalid) {
      this.authError.set('Please check the form. Name, email, and password must each be at most 255 characters.');
      return;
    }
    this.registering.set(true);
    this.http.post('/api/auth/register', {
      name: this.accountName.trim(),
      email: this.accountEmail.trim(),
      password: this.accountPassword
    }, { responseType: 'text' }).pipe(
      timeout(15000),
      finalize(() => this.registering.set(false))
    ).subscribe({
      next: (message) => {
        this.loginEmail = this.accountEmail.trim();
        this.loginPassword = '';
        this.accountPassword = '';
        this.accountCreated.set(false);
        this.loginSubmitted.set(false);
        this.authMode.set('login');
        this.authMessage.set('Account created successfully. Please log in.');
      },
      error: (error) => this.authError.set(this.apiErrorMessage(error, 'Could not create the account. Check your connection and try again.'))
    });
  }

  protected login(): void {
    this.authMessage.set('');
    this.authError.set('');
    this.http.post<LoginResponse>('/api/auth/login', {
      email: this.loginEmail,
      password: this.loginPassword
    }).subscribe({
      next: (message) => {
        this.loginSubmitted.set(true);
        this.auth.account.set(message);
        this.loginPassword = '';
        this.authMessage.set('Login successful.');
        this.router.navigate(['/dashboard']);
      },
      error: (error) => this.authError.set(this.apiErrorMessage(error, 'Incorrect email or password.'))
    });
  }
}
