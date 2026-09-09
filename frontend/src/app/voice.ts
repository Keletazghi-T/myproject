import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, filter, firstValueFrom, from, timeout, timer } from 'rxjs';

interface Member { memberId: string; id: string; name: string; busy: boolean; }
interface Call { id: string; otherName: string; outgoing: boolean; status: string; offer: string; answer: string | null; }
interface State { members: Member[]; call: Call | null; }

@Component({
  selector: 'app-voice',
  imports: [RouterLink],
  template: `
    <main class="voice-page" [class.call-popup]="!fullPage()" [hidden]="!fullPage() && !call() && !working()">
      @if (fullPage()) { <a routerLink="/dashboard">← Back to dashboard</a> }
      <h1>Voice Call</h1>
      <p>Receive calls anywhere in the app while signed in.</p>
      <p class="status" role="status">{{ status() }}</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (call(); as current) {
        <section class="call-panel" aria-label="Current call">
          <h2>{{ current.otherName }}</h2>
          @if (!current.outgoing && current.status === 'RINGING') {
            <p>Incoming voice call</p>
            <button type="button" (click)="accept()" [disabled]="working()">{{ working() ? 'Connecting…' : 'Accept' }}</button>
            <button class="secondary" type="button" (click)="hangUp()">Decline</button>
          } @else {
            @if (connected()) {
              <button type="button" (click)="toggleMute()" [attr.aria-pressed]="muted()">{{ muted() ? 'Unmute microphone' : 'Mute microphone' }}</button>
            }
            <button class="secondary" type="button" (click)="hangUp()">{{ connected() ? 'Hang up' : 'Cancel call' }}</button>
          }
        </section>
      } @else if (working()) {
        <button class="secondary" type="button" (click)="hangUp()">Cancel call</button>
      }
      <audio #remoteAudio autoplay controls [hidden]="!connected()" aria-label="Call audio"></audio>
      @if (fullPage()) {
      @if (selectedId()) {
        <h2>Call {{ selectedName() }}</h2>
        <p>We will check whether this member is online and try to call them.</p>
        <a [routerLink]="['/messages', selectedId()]">Text {{ selectedName() }} instead</a>
      } @else { <h2>Available members</h2> }
      <div class="members">
        @for (member of visibleMembers(); track member.id) {
          <div class="member">
            <span>{{ member.name }} @if (member.busy) { <small>In a call</small> }</span>
            <button type="button" [disabled]="!ready() || working() || call() !== null || member.busy" (click)="start(member)">Call {{ member.name }}</button>
          </div>
        } @empty {
          <p>{{ selectedId() ? selectedName() + ' is not online.' : 'No other members are online.' }}</p>
        }
      </div>
      @if (selectedId() && !call() && !working()) {
        <button type="button" (click)="trySelected()" [disabled]="!ready()">Try call again</button>
      }
      }
    </main>
  `,
  styles: [`
    .voice-page { max-width: 48rem; margin: 2rem auto; padding: 2rem; background: #f7f4ec; color: #183b3b; }
    .call-popup { position: fixed; z-index: 1000; bottom: 1rem; right: 1rem; width: min(26rem, calc(100vw - 2rem)); max-height: 85vh; overflow-y: auto; margin: 0; border: 2px solid #183b3b; box-shadow: 0 6px 24px #0003; }
    h1 { font: 3rem Georgia, serif; margin-bottom: 1rem; }
    p { line-height: 1.6; }
    a { color: #183b3b; }
    .status, .call-panel { padding: 1rem; background: #eef5ed; border: 1px solid #b9b6a9; }
    .error { color: #b33928; }
    .member { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #d9d3c5; }
    button { padding: .7rem 1rem; margin: .25rem; background: #183b3b; color: white; border: 1px solid #183b3b; cursor: pointer; font: inherit; }
    button.secondary { background: transparent; color: #b33928; border-color: #b33928; }
    button:disabled { opacity: .5; cursor: default; }
    small { display: block; }
    audio { max-width: 100%; margin-top: 1rem; }
    @media (max-width: 600px) { .voice-page { margin: 1rem; padding: 1rem; } }
  `]
})
export class VoiceComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly clientId = crypto.randomUUID();
  private readonly router = inject(Router);
  protected readonly fullPage = signal(false);
  private attemptSelected = false;
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selectedName = signal('Selected member');
  protected readonly members = signal<Member[]>([]);
  protected readonly call = signal<Call | null>(null);
  protected readonly status = signal('Connecting to the call service…');
  protected readonly error = signal('');
  protected readonly ready = signal(false);
  protected readonly working = signal(false);
  protected readonly connected = signal(false);
  protected readonly muted = signal(false);
  @ViewChild('remoteAudio') private audio?: ElementRef<HTMLAudioElement>;
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private config: RTCConfiguration = {};
  private generation = 0;
  private destroyed = false;
  private readonly dismissedCalls = new Set<string>();
  private connectionTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.updateRoute();
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.updateRoute());
    timer(0, 1000).pipe(
      exhaustMap(() => from(this.refresh()).pipe(catchError(() => {
        this.ready.set(false);
        this.error.set('Call service unavailable. Retrying automatically…');
        return EMPTY;
      }))),
      takeUntilDestroyed()
    ).subscribe();
  }

  private updateRoute(): void {
    const url = this.router.parseUrl(this.router.url);
    const fullPage = url.root.children['primary']?.segments[0]?.path === 'voice';
    const selectedId = fullPage ? url.queryParams['member'] || null : null;
    const changed = selectedId !== this.selectedId() || fullPage !== this.fullPage();
    this.fullPage.set(fullPage);
    this.selectedId.set(selectedId);
    if (changed) {
      this.attemptSelected = !!selectedId && !this.call() && !this.working();
      this.selectedName.set('Selected member');
      if (selectedId) {
        this.http.get<{id: string; name: string}[]>('/api/members').subscribe({
          next: members => {
            if (this.selectedId() === selectedId) this.selectedName.set(members.find(member => member.id === selectedId)?.name || 'Selected member');
          },
          error: () => this.error.set('The selected member could not be loaded.')
        });
      }
    }
  }

  protected trySelected(): void {
    this.attemptSelected = true;
    this.error.set('');
    this.status.set('Checking whether this member is online…');
  }

  private async callSelected(): Promise<void> {
    if (!this.attemptSelected || !this.selectedId() || this.working() || this.call()) return;
    this.attemptSelected = false;
    const member = this.members().find(member => member.memberId === this.selectedId());
    if (!member) { this.status.set('This member is not online.'); return; }
    if (member.busy) { this.status.set(`${member.name} is already in a call.`); return; }
    await this.start(member);
  }

  protected visibleMembers(): Member[] {
    return this.members().filter(member => !this.selectedId() || member.memberId === this.selectedId());
  }

  private async refresh(): Promise<void> {
    const generation = this.generation;
    if (!this.ready()) this.config = await firstValueFrom(this.http.get<RTCConfiguration>('/api/voice/config').pipe(timeout(10000)));
    const state = await firstValueFrom(this.http.get<State>(`/api/voice/state?clientId=${this.clientId}`).pipe(timeout(10000)));
    if (this.destroyed || generation !== this.generation) return;
    this.members.set(state.members);
    if (!this.ready()) {
      this.ready.set(true);
      this.error.set('');
      if (!this.call()) this.status.set('Ready to receive calls');
    }
    if (this.working()) return;
    if (!state.call || state.call.status === 'ENDED') {
      if (this.call()) { this.release(); this.status.set('Call ended'); }
      await this.callSelected();
      return;
    }
    if (this.dismissedCalls.has(state.call.id)) { await this.callSelected(); return; }
    if (state.call.outgoing && !this.pc) {
      this.dismissedCalls.add(state.call.id);
      this.endRemote(state.call.id);
      this.status.set('Call ended. Please try again.');
      return;
    }
    this.call.set(state.call);
    if (state.call.status === 'RINGING') {
      this.status.set(state.call.outgoing ? `Calling ${state.call.otherName}…` : `${state.call.otherName} is calling`);
    } else if (state.call.outgoing && this.pc && !this.pc.remoteDescription && state.call.answer) {
      const pc = this.pc;
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: state.call.answer });
        if (this.pc === pc) this.watchConnection();
      } catch (error) { if (this.pc === pc) this.fail(error); }
    }
  }

  protected async start(member: Member): Promise<void> {
    if (this.working() || this.call() || !this.ready()) return;
    this.attemptSelected = false;
    this.working.set(true); this.error.set(''); this.status.set('Requesting microphone access…');
    const generation = ++this.generation;
    try {
      const pc = await this.prepare(generation);
      await pc.setLocalDescription(await pc.createOffer());
      await this.gather(pc);
      if (generation !== this.generation) return;
      const call = await firstValueFrom(this.http.post<Call>('/api/voice/calls', {
        clientId: this.clientId, targetId: member.id, offer: pc.localDescription!.sdp
      }).pipe(timeout(15000)));
      if (generation !== this.generation || this.destroyed) { this.dismissedCalls.add(call.id); this.endRemote(call.id); return; }
      this.call.set(call); this.status.set(`Calling ${member.name}…`);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally { if (generation === this.generation) this.working.set(false); }
  }

  protected async accept(): Promise<void> {
    const call = this.call();
    if (!call || call.outgoing || this.working()) return;
    this.working.set(true); this.error.set(''); this.status.set('Requesting microphone access…');
    const generation = ++this.generation;
    try {
      const pc = await this.prepare(generation);
      await pc.setRemoteDescription({ type: 'offer', sdp: call.offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await this.gather(pc);
      if (generation !== this.generation) return;
      const accepted = await firstValueFrom(this.http.post<Call>(`/api/voice/calls/${call.id}/answer`, {
        clientId: this.clientId, answer: pc.localDescription!.sdp
      }).pipe(timeout(15000)));
      if (generation !== this.generation || this.destroyed) { this.dismissedCalls.add(call.id); this.endRemote(call.id); return; }
      this.call.set(accepted); this.watchConnection();
    } catch (error) { if (generation === this.generation) this.fail(error); }
    finally { if (generation === this.generation) this.working.set(false); }
  }

  private async prepare(generation: number): Promise<RTCPeerConnection> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires HTTPS and a supported browser.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (this.destroyed || generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop()); throw new Error('Call cancelled.');
    }
    this.stream = stream;
    const pc = new RTCPeerConnection(this.config); this.pc = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
      if (this.pc !== pc || !this.audio) return;
      this.audio.nativeElement.srcObject = event.streams[0] || new MediaStream([event.track]);
      void this.audio.nativeElement.play().catch(() => this.error.set('Press play on the audio controls to hear the other member.'));
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(this.connectionTimer);
        this.connected.set(true); this.status.set('Connected — voice call');
      } else if (pc.connectionState === 'failed') {
        this.fail(new Error('The audio connection failed. Try another network or ask the site owner to configure a call relay.'));
      } else if (pc.connectionState === 'disconnected') {
        this.connected.set(false); this.watchConnection();
      }
    };
    return pc;
  }

  // Send complete SDP after gathering candidates; no media is stored on the backend.
  private gather(pc: RTCPeerConnection): Promise<void> {
    return new Promise(resolve => {
      const finish = () => { clearTimeout(limit); pc.removeEventListener('icegatheringstatechange', changed); resolve(); };
      const changed = () => { if (pc.iceGatheringState === 'complete') finish(); };
      const limit = setTimeout(finish, 8000);
      pc.addEventListener('icegatheringstatechange', changed);
      changed();
    });
  }
  private watchConnection(): void {
    if (this.pc?.connectionState === 'connected') return;
    this.status.set('Connecting audio…'); clearTimeout(this.connectionTimer);
    this.connectionTimer = setTimeout(() => this.fail(new Error('Could not connect the audio. Try another network or ask the site owner to configure a call relay.')), 30000);
  }
  protected toggleMute(): void {
    this.muted.update(value => !value);
    this.stream?.getAudioTracks().forEach(track => track.enabled = !this.muted());
  }
  protected hangUp(): void {
    const id = this.call()?.id;
    if (id) this.dismissedCalls.add(id);
    this.release(); this.status.set('Call ended');
    if (id) this.endRemote(id);
  }
  private endRemote(id: string): void {
    this.http.post(`/api/voice/calls/${id}/end`, { clientId: this.clientId }).pipe(timeout(10000)).subscribe({
      error: () => { if (!this.destroyed) this.error.set('Audio stopped. The other member may see the call until it times out.'); }
    });
  }
  private fail(error: unknown): void {
    const details = error as { name?: string; message?: string; error?: { message?: string } };
    this.hangUp();
    this.error.set(details.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access in your browser and try again.'
      : details.name === 'NotFoundError' ? 'No microphone was found. Connect a microphone and try again.'
      : details.error?.message || details.message || 'The call could not be started. Please try again.');
  }
  private release(): void {
    this.generation++; clearTimeout(this.connectionTimer);
    const pc = this.pc; this.pc = null; pc?.close();
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    if (this.audio) this.audio.nativeElement.srcObject = null;
    this.call.set(null); this.connected.set(false); this.muted.set(false); this.working.set(false);
  }
  ngOnDestroy(): void {
    this.destroyed = true; this.hangUp();
    this.http.post('/api/voice/leave', { clientId: this.clientId }).pipe(timeout(10000)).subscribe({ error: () => {} });
  }
}
