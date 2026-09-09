import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  platform: string;
  link: string;
  joinUrl: string | null;
}

@Component({
  selector: 'app-meeting',
  standalone: true,
  template: `
    <main class="meeting-page">
      <section class="meeting-room">
        <button class="back-button" type="button" (click)="goBack()">&larr; Back</button>
        @if (meeting()) {
          <p class="eyebrow">Metsalu meeting room</p>
          <h1>{{ meeting()?.title }}</h1>
          <p class="meeting-id">{{ meeting()?.date }} at {{ meeting()?.time }} · {{ meeting()?.duration }} · {{ meeting()?.platform }}</p>
          @if (meeting()?.joinUrl) {
            <p>Open the invitation link to join using {{ meeting()?.platform }}.</p>
            <a class="join-button" [href]="meeting()?.joinUrl" target="_blank" rel="noopener noreferrer">Join meeting</a>
          } @else {
            <p>The organizer has not provided a call link for this meeting. Please contact them for an invitation.</p>
          }
        } @else if (loading()) {
          <p class="eyebrow">Loading meeting…</p>
        } @else {
          <p class="eyebrow">Metsalu meeting room</p>
          <h1>Meeting unavailable</h1>
          <p class="meeting-id">The meeting could not be loaded. Please return and try again.</p>
        }
      </section>
    </main>
  `,
  styles: [`
    .meeting-page { min-height: calc(100vh - 4.5rem); display: grid; place-items: center; padding: 2rem; }
    .meeting-room { width: min(100%, 42rem); padding: clamp(2rem, 6vw, 4.5rem); background: #f7f4ec; border: 1px solid #d9d3c5; box-shadow: 12px 12px 0 #d9d3c5; }
    .eyebrow { margin: 0; color: #d4512d; font: 0.72rem "IBM Plex Mono", monospace; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 1rem 0; color: #183b3b; font: 400 clamp(2.5rem, 8vw, 5rem) "DM Serif Display", Georgia, serif; }
    .meeting-id, .meeting-room p:last-child { color: #4f5b58; font: 0.85rem/1.6 "IBM Plex Mono", monospace; }
    .room-status { margin: 2rem 0 1rem; padding: 1rem; background: #183b3b; color: #f7f4ec; font: 0.85rem "IBM Plex Mono", monospace; }
    .back-button { margin-bottom: 1.5rem; padding: 0.55rem 0.75rem; border: 1px solid #183b3b; background: transparent; color: #183b3b; font: 500 0.72rem "IBM Plex Mono", monospace; cursor: pointer; }
    .join-button { display: inline-block; margin-top: 1rem; padding: 0.8rem 1rem; background: #d4512d; color: #fffaf1; font: 500 0.78rem "IBM Plex Mono", monospace; letter-spacing: 0.05em; text-decoration: none; text-transform: uppercase; }
    .join-button, .leave-button { border: 0; cursor: pointer; }
    .joined-status { background: #2d7652; }
    .active-room { padding: 1rem; background: #eef5ed; color: #2d7652; font: 0.85rem/1.6 "IBM Plex Mono", monospace; }
    .leave-button { margin-top: 1rem; padding: 0.7rem 0.9rem; border: 1px solid #183b3b; background: transparent; color: #183b3b; font: 500 0.75rem "IBM Plex Mono", monospace; text-transform: uppercase; }
  `]
})
export class MeetingComponent {
  protected readonly meetingId: string;
  protected readonly meeting = signal<Meeting | null>(null);
  protected readonly loading = signal(true);

  constructor(route: ActivatedRoute, private readonly router: Router, http: HttpClient) {
    this.meetingId = route.snapshot.paramMap.get('id') || 'unknown';
    http.get<Meeting>(`/api/meetings/${this.meetingId}`).subscribe({
      next: (meeting) => { this.meeting.set(meeting); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  protected goBack(): void {
    this.router.navigate(['/dashboard']);
  }

}
