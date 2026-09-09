import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, filter, switchMap, timeout, timer } from 'rxjs';

interface Message { id: number; own: boolean; text: string; createdAt: string; }
interface Conversation { memberId: string; name: string; messages: Message[]; }
@Component({
  selector: 'app-messages',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <main>
      <a routerLink="/dashboard">← Back to members</a>
      <h1>{{ conversation() ? 'Text ' + conversation()!.name : 'Private conversation' }}</h1>
      @if (conversation(); as current) {
        <a class="call-link" routerLink="/voice" [queryParams]="{member: current.memberId}">Call {{ current.name }}</a>
        <p>Private messages between you and {{ current.name }}. Showing the latest 100 messages.</p>
        <div class="messages" aria-live="polite" aria-label="Conversation">
          @for (message of current.messages; track message.id) {
            <article [class.own]="message.own">
              <strong>{{ message.own ? 'You' : current.name }}</strong>
              <p>{{ message.text }}</p>
              <time>{{ message.createdAt | date:'short' }}</time>
            </article>
          } @empty { <p>No messages yet. Say hello.</p> }
        </div>
        <form (ngSubmit)="send()">
          <label for="message">Your message</label>
          <textarea id="message" name="message" [(ngModel)]="draft" maxlength="4000" rows="3" required></textarea>
          <button type="submit" [disabled]="sending() || !draft.trim()">{{ sending() ? 'Sending…' : 'Send message' }}</button>
        </form>
      }
      @if (syncError()) { <p class="error" role="status">{{ syncError() }}</p> }
      @if (sendError()) { <p class="error" role="alert">{{ sendError() }}</p> }
    </main>
  `,
  styles: [`
    main { max-width: 48rem; padding: 2rem; margin: 2rem auto; background: #f7f4ec; color: #183b3b; }
    a { color: #183b3b; } h1 { font: 2.3rem Georgia, serif; }
    .messages { display: grid; gap: .8rem; margin: 1.5rem 0; }
    article { padding: 1rem; margin-right: 2rem; border: 1px solid #d9d3c5; background: white; overflow-wrap: anywhere; }
    article.own { margin-right: 0; margin-left: 2rem; background: #eef5ed; }
    article p { white-space: pre-wrap; } time { font-size: .75rem; }
    textarea { display: block; width: 100%; margin: .5rem 0; padding: .8rem; font: inherit; resize: vertical; }
    button, .call-link { display: inline-block; padding: .7rem 1rem; background: #183b3b; color: white; border: 0; font: inherit; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; } .error { color: #b33928; }
    @media (max-width: 600px) { main { margin: 1rem; padding: 1rem; } }
  `]
})
export class MessagesComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  protected readonly conversation = signal<Conversation | null>(null);
  protected readonly syncError = signal('');
  protected readonly sendError = signal('');
  protected readonly sending = signal(false);
  protected draft = '';
  private memberId = '';
  private revision = 0;
  constructor() {
    this.route.paramMap.pipe(switchMap(params => {
      this.memberId = params.get('memberId') || '';
      const memberId = this.memberId;
      this.revision++; this.conversation.set(null); this.draft = ''; this.sendError.set('');
      return timer(0, 2000).pipe(exhaustMap(() => {
        const revision = this.revision;
        return this.http.get<Conversation>(`/api/messages/${memberId}`).pipe(
          timeout(10000),
          filter(() => this.revision === revision),
          catchError(error => { this.syncError.set(error.error?.message || 'Messages could not be loaded. Retrying automatically…'); return EMPTY; })
        );
      }));
    }), takeUntilDestroyed()).subscribe(conversation => { this.conversation.set(conversation); this.syncError.set(''); });
  }
  protected send(): void {
    const text = this.draft.trim(), memberId = this.memberId;
    if (!text || this.sending()) return;
    this.sending.set(true); this.sendError.set('');
    this.http.post<Message>(`/api/messages/${memberId}`, { text }).pipe(timeout(10000)).subscribe({
      next: message => {
        if (this.memberId === memberId) {
          this.revision++;
          this.conversation.update(current => current && ({ ...current, messages: [...current.messages.filter(item => item.id !== message.id), message].sort((a,b) => a.id-b.id).slice(-100) }));
          if (this.draft.trim() === text) this.draft = '';
        }
        this.sending.set(false);
      },
      error: error => { this.sending.set(false); if (this.memberId === memberId) this.sendError.set(error.error?.message || 'Message could not be sent. Please try again.'); }
    });
  }
}
