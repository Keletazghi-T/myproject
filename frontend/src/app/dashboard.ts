import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, filter, map, timeout, timer } from 'rxjs';
import { AuthService } from './auth.service';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface Comment {
  id: number;
  parentId?: number | null;
  author: string;
  text: string;
}

interface AccountResponse {
  name: string;
  email: string;
  role: string;
}

interface Meeting {
  id?: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  platform: string;
  link?: string;
}

interface Notification {
  audience: string;
  message: string;
  link: string;
}

interface Member {
  joinedAt: string | null;
  id: string;
  self: boolean;
  name: string;
  email: string | null;
  role: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <main class="dashboard-page">
      <section class="dashboard-panel" aria-labelledby="dashboard-title">
        <p class="eyebrow">Metsalu Website</p>
        <h1 id="dashboard-title">Explore Metsalu</h1>
        <p class="intro">Your login was successful. Choose a place to begin.</p>

        <div class="account-bar">
          <span>Signed in as <strong>{{ userName }}</strong></span>
          <div class="account-actions">
            <button class="back-button" type="button" (click)="goBack()">&larr; Back</button>
            <button class="logout-button" type="button" (click)="logout()">Log out</button>
          </div>
        </div>

        <button class="profile-card" type="button" (click)="toggleProfile()" [attr.aria-expanded]="profileOpen()" aria-controls="profile-details">
          <div class="profile-avatar" aria-hidden="true">{{ userName.charAt(0).toUpperCase() }}</div>
          <div>
            <p class="eyebrow">My profile</p>
            <h2 id="profile-title">{{ userName }}</h2>
            <p>{{ userEmail }}</p>
            <span class="role-badge">{{ userRole === 'ADMIN' ? 'Admin' : 'Member' }}</span>
          </div>
          <span class="profile-arrow" aria-hidden="true">{{ profileOpen() ? '&uarr;' : '&darr;' }}</span>
        </button>

        @if (profileOpen()) {
          <section class="profile-details" id="profile-details" aria-labelledby="profile-details-title">
            <p class="eyebrow" id="profile-details-title">Profile details</p>
            <dl>
              <div><dt>Name</dt><dd>{{ userName }}</dd></div>
              <div><dt>Email</dt><dd>{{ userEmail }}</dd></div>
              <div><dt>Role</dt><dd>{{ userRole === 'ADMIN' ? 'Admin' : 'Member' }}</dd></div>
              <div><dt>Account status</dt><dd>Active</dd></div>
              <div><dt>Comment name</dt><dd>{{ userName }}</dd></div>
              <div><dt>Access</dt><dd>{{ isAdmin ? 'Meeting scheduling and comment deletion' : 'Comments and destination links' }}</dd></div>
            </dl>
            <div class="profile-actions">
              <button class="profile-action-button" type="button" (click)="toggleProfileEdit()">
                {{ profileEditing() ? 'Cancel editing' : 'Edit profile' }}
              </button>
              <button class="profile-delete-button" type="button" (click)="deleteAccount()">Delete account</button>
            </div>

            @if (profileEditing()) {
              <form class="profile-form" #profileForm="ngForm" (ngSubmit)="profileForm.valid && updateAccount()">
                <label>Name <input name="profileName" [(ngModel)]="editName" required /></label>
                <label>Email <input name="profileEmail" type="email" [(ngModel)]="editEmail" required /></label>
                <label>New password <input name="profilePassword" type="password" [(ngModel)]="editPassword" maxlength="255" placeholder="Leave blank to keep current password" /></label>
                <button class="submit-button" type="submit">Save profile</button>
              </form>
            }
            @if (profileMessage()) {
              <p class="profile-message">{{ profileMessage() }}</p>
            }
            @if (profileError()) {
              <p class="comment-error">{{ profileError() }}</p>
            }
          </section>
        }

        <button class="members-toggle" type="button" (click)="toggleMembers()">
          {{ membersOpen() ? 'Hide members' : 'View members' }}
        </button>

        @if (membersOpen()) {
          <section class="members-section" aria-labelledby="members-title">
            <p class="eyebrow" id="members-title">Metsalu members</p>
            <div class="member-list">
              @for (member of members(); track member.id) {
                <div>
                <button class="member-row" style="width: 100%; text-align: left; cursor: pointer" type="button" [disabled]="member.self"
                  [attr.aria-label]="member.name + (member.self ? ' (You)' : '')" [attr.aria-expanded]="selectedMember() === member.id" (click)="selectedMember.set(selectedMember() === member.id ? null : member.id)">
                  <span class="member-avatar" aria-hidden="true">{{ member.name.charAt(0).toUpperCase() }}</span>
                  <div>
                    <strong>{{ member.name }}{{ member.self ? ' (You)' : '' }}</strong>
                    <small>Joined: {{ member.joinedAt ? (member.joinedAt | date:'mediumDate') : 'Not recorded' }}</small>
                    @if (isAdmin && member.email) {
                      <small>{{ member.email }} · {{ member.role === 'ADMIN' ? 'Admin' : 'Member' }}</small>
                    }
                  </div>
                </button>
                @if (selectedMember() === member.id && !member.self) {
                  <div class="account-actions" style="padding: 0.75rem">
                    <a class="back-button" [routerLink]="['/messages', member.id]">Text {{ member.name }}</a>
                    <a class="back-button" routerLink="/voice" [queryParams]="{member: member.id}">Call {{ member.name }}</a>
                  </div>
                }
                </div>
              } @empty {
                <p class="empty-members">No active members.</p>
              }
            </div>
            @if (membersError()) {
              <p class="comment-error">{{ membersError() }}</p>
            }
          </section>
        }

        <div class="option-list">
          <a class="option-card" routerLink="/voice">
            <span><strong>Voice Call</strong><small>Call another member privately with audio.</small></span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>
          <a class="option-card" href="https://www.google.com/maps/dir//3395%2B2CH+Abune-Aregawi,church(+%E1%8A%A3%E1%89%A1%E1%8A%90+%E1%8A%A3%E1%88%A8%E1%8C%8B%E1%8B%8A+%E1%89%A4%E1%89%B0%E1%8A%AD%E1%88%AD%E1%88%B5%E1%89%B2%E1%8B%AB%E1%8A%95+%E1%88%98%E1%8C%BB%E1%88%89),+Dekemhare,+Eritrea/@15.0673362,39.0532237,725m/data=!3m1!1e3!4m17!1m7!3m6!1s0x166dbfe3d43f72a9:0xe012e793077e9638!2zQWJ1bmUtQXJlZ2F3aSxjaHVyY2goIOGKo-GJoeGKkCDhiqPhiKjhjIvhi4og4Ymk4Ymw4Yqt4Yit4Yi14Ymy4Yur4YqVIOGImOGMu-GIiSk!8m2!3d15.0675548!4d39.0586153!16s%2Fg%2F11qzlzb598!4m8!1m0!1m5!1m1!1s0x166dbfe3d43f72a9:0xe012e793077e9638!2m2!1d39.0586153!2d15.0675543!3e0!5m1!1e3?entry=ttu&g_ep=EgoyMDI2MDkwMi4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">
            <span>
              <small class="recommended-badge">Recommended</small>
              <strong>Enda Abune Aregawi Church</strong>
              <small>Get directions to the church.</small>
            </span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>

          <a class="option-card" href="https://www.google.com/maps/place/K'eyih+Kor,+Eritrea/@15.1002357,39.0516273,2569m/data=!3m1!1e3!4m15!1m8!3m7!1s0x166dbec1fa2c2c93:0x21b7d69e7787cfc7!2sDekemhare,+Eritrea!3b1!8m2!3d15.0715172!4d39.042423!16zL20vMDZqMHFo!3m5!1s0x166dbe72c625f285:0xd3c482dd2c995d69!8m2!3d15.1002517!4d39.0581642!16s%2Fg%2F11jk0s0knx!5m1!1e3?entry=ttu&g_ep=EgoyMDI2MDkwMi4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">
            <span>
              <small class="recommended-badge">Recommended</small>
              <strong>Keyhkor Map</strong>
              <small>Find Keyhkor on the map.</small>
            </span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>

          <a class="option-card" href="https://www.google.com/maps/place/Dekemhare,+Eritrea/@15.0673362,39.0532237,725m/data=!3m1!1e3!4m6!3m5!1s0x166dbec1fa2c2c93:0x21b7d69e7787cfc7!8m2!3d15.0715172!4d39.042423!16zL20vMDZqMHFo!5m1!1e3?entry=ttu&g_ep=EgoyMDI2MDkwMi4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">
            <span>
              <strong>Metsalu Map</strong>
              <small>Find Metsalu on the map.</small>
            </span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>

          <a class="option-card" href="https://en.wikipedia.org/wiki/Dekemhare" target="_blank" rel="noopener noreferrer">
            <span>
              <strong>About Metsalu</strong>
              <small>Learn more about the area and community.</small>
            </span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>
        </div>

        <div class="meeting-section">
          <div class="meeting-heading">
            <p class="eyebrow">Meet together</p>
            <h2>Schedule a meeting</h2>
            <p>{{ isAdmin ? 'Create a call with your meeting provider, then share its invitation link here.' : 'Only admins can create meetings.' }}</p>
          </div>
          @if (isAdmin) {
          <button class="meeting-toggle" type="button" (click)="toggleMeetingForm()">
            {{ meetingOpen() ? 'Hide meeting form' : 'Schedule a meeting' }}
          </button>
          @if (meetingOpen()) {
          <form class="meeting-form" #meetingForm="ngForm" (ngSubmit)="meetingForm.valid && scheduleMeeting()">
            <label>Meeting title <input name="meetingTitle" [(ngModel)]="meetingTitle" required placeholder="Metsalu community meeting" /></label>
            <div class="meeting-fields">
              <label>Date <input name="meetingDate" type="date" [(ngModel)]="meetingDate" required /></label>
              <label>Time <input name="meetingTime" type="time" [(ngModel)]="meetingTime" required /></label>
              <label>Duration
                <select name="meetingDuration" [(ngModel)]="meetingDuration">
                  <option value="30 minutes">30 minutes</option>
                  <option value="1 hour">1 hour</option>
                  <option value="2 hours">2 hours</option>
                </select>
              </label>
            </div>
            <label>Platform
              <select name="meetingPlatform" [(ngModel)]="meetingPlatform">
                <option>Zoom</option>
                <option>Google Meet</option>
                <option>Microsoft Teams</option>
              </select>
            </label>
            <label>Invitation link <input name="meetingJoinUrl" type="url" [(ngModel)]="meetingJoinUrl" required placeholder="Paste the HTTPS invitation link from your meeting provider" /></label>
            <button class="submit-button" type="submit">Schedule meeting</button>
          </form>
          }
          }
          @if (scheduledMeeting()) {
            <div class="scheduled-meeting" aria-live="polite">
              <p class="eyebrow">Meeting scheduled</p>
              <strong>{{ scheduledMeeting()?.title }}</strong>
              <p>{{ scheduledMeeting()?.date }} at {{ scheduledMeeting()?.time }} · {{ scheduledMeeting()?.duration }} · {{ scheduledMeeting()?.platform }}</p>
              <a class="meeting-link" [href]="scheduledMeeting()?.link" target="_blank" rel="noopener noreferrer">Open meeting link</a>
            </div>
          }
          @if (meetingError()) {
            <p class="comment-error">{{ meetingError() }}</p>
          }
        </div>

        @if (selectedOption()) {
          <div class="selection-note" aria-live="polite">
            <p class="eyebrow">Selected destination</p>
            <p>{{ selectedOption() }}</p>
          </div>
        }

        <button class="comments-toggle" type="button" (click)="toggleComments()">
          {{ commentsOpen() ? 'Hide comments' : 'View comments and add your idea' }}
        </button>

        @if (commentsOpen()) {
          <section class="comments-section" aria-labelledby="comments-title">
            <form class="idea-form" (ngSubmit)="addIdea()">
              <p class="eyebrow">Community ideas</p>
              <h2 id="comments-title">Share an idea or comment</h2>
              <textarea
                name="idea"
                [(ngModel)]="ideaText"
                placeholder="What would you like to share about Metsalu?"
                rows="4"
                required
              ></textarea>
              <button class="submit-button" type="submit">Add idea or comment</button>
            </form>

            @if (ideas().length > 0) {
              <div class="idea-list" aria-live="polite">
                @for (idea of threads(); track idea.id) {
                  <article>
                  <div class="idea-item">
                    <p><strong>{{ idea.author }}</strong>{{ idea.text }}</p>
                    @if (isAdmin) {
                      <button class="delete-button" type="button" (click)="deleteIdea(idea.id)">Delete</button>
                    }
                  </div>
                  <button class="back-button" type="button" (click)="toggleReply(idea.id)" [attr.aria-expanded]="replyOpen() === idea.id">Reply</button>
                  @for (reply of idea.replies; track reply.id) {
                    <div class="idea-item" style="margin-left: 1.5rem; margin-top: 0.5rem">
                      <p><strong>{{ reply.author }}</strong>{{ reply.text }}</p>
                      @if (isAdmin) {
                        <button class="delete-button" type="button" (click)="deleteIdea(reply.id)">Delete reply</button>
                      }
                    </div>
                  }
                  @if (replyOpen() === idea.id) {
                    <form (ngSubmit)="addReply(idea.id)" style="margin: 0.75rem 0 0 1.5rem">
                      <label [for]="'reply-' + idea.id">Reply to {{ idea.author }}</label>
                      <textarea [id]="'reply-' + idea.id" name="reply" [(ngModel)]="replyDrafts[idea.id]" rows="2" maxlength="4000" required></textarea>
                      <button class="submit-button" type="submit" [disabled]="replySending() !== null">{{ replySending() === idea.id ? 'Sending…' : 'Post reply' }}</button>
                      <button class="back-button" type="button" (click)="replyOpen.set(null)">Cancel</button>
                      @if (replyError()) {
                        <p class="comment-error" role="alert">{{ replyError() }}</p>
                      }
                    </form>
                  }
                  </article>
                }
              </div>
            } @else {
              <p class="empty-comments">No comments yet. Be the first to share an idea.</p>
            }

            @if (commentSyncError()) {
              <p class="comment-error" role="status">{{ commentSyncError() }}</p>
            }
            @if (commentError()) {
              <p class="comment-error">{{ commentError() }}</p>
            }
          </section>
        }

        @if (notifications().length > 0) {
          <section class="notifications" aria-live="polite">
            <p class="eyebrow">Notifications</p>
            @for (notification of notifications(); track $index) {
              <a [href]="notification.link" target="_blank" rel="noopener noreferrer">{{ notification.message }}</a>
            }
          </section>
        }
      </section>
    </main>
  `,
  styles: [`
    .dashboard-page {
      min-height: calc(100vh - 4.5rem);
      display: grid;
      place-items: center;
      padding: 2rem;
    }

    .dashboard-panel {
      width: min(100%, 52rem);
      padding: clamp(2rem, 6vw, 4.5rem);
      background: #f7f4ec;
      border: 1px solid #d9d3c5;
      box-shadow: 12px 12px 0 #d9d3c5;
    }

    .eyebrow {
      margin: 0;
      color: #d4512d;
      font: 0.72rem "IBM Plex Mono", monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 1rem 0 0.75rem;
      color: #183b3b;
      font: 400 clamp(2.5rem, 8vw, 5rem) "DM Serif Display", Georgia, serif;
      line-height: 0.98;
    }

    .intro {
      margin: 0;
      color: #4f5b58;
      font: 1rem/1.6 "IBM Plex Mono", monospace;
    }

    .account-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-top: 1.5rem;
      padding: 0.8rem 1rem;
      background: #e8e4d9;
      color: #4f5b58;
      font: 0.78rem "IBM Plex Mono", monospace;
    }

    .account-bar strong {
      display: inline;
      color: #183b3b;
      font-size: inherit;
    }

    .profile-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
      padding: 1.25rem;
      border: 1px solid #d9d3c5;
      background: #fffdf7;
      color: inherit;
      text-align: left;
      cursor: pointer;
      font: inherit;
      width: 100%;
    }

    .profile-card:hover {
      border-color: #d4512d;
    }

    .profile-arrow {
      margin-left: auto;
      color: #d4512d;
      font-size: 1.2rem;
    }

    .profile-avatar {
      display: grid;
      width: 3rem;
      height: 3rem;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 50%;
      background: #183b3b;
      color: #efb443;
      font: 1.2rem "DM Serif Display", Georgia, serif;
    }

    .profile-card h2 {
      margin: 0.3rem 0;
      color: #183b3b;
      font: 1.2rem "IBM Plex Mono", monospace;
    }

    .profile-card p:not(.eyebrow) {
      margin: 0 0 0.6rem;
      color: #71807b;
      font: 0.78rem "IBM Plex Mono", monospace;
    }

    .role-badge {
      display: inline-block;
      padding: 0.2rem 0.45rem;
      background: #efb443;
      color: #183b3b;
      font: 0.62rem "IBM Plex Mono", monospace;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .profile-details {
      margin-top: 0.25rem;
      padding: 1.25rem;
      border: 1px solid #d9d3c5;
      border-top: 0;
      background: #e8e4d9;
    }

    .profile-details dl {
      display: grid;
      gap: 0.7rem;
      margin: 1rem 0 0;
    }

    .profile-details dl div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      border-bottom: 1px solid #d1ccbf;
      padding-bottom: 0.55rem;
    }

    .profile-details dt,
    .profile-details dd {
      margin: 0;
      font: 0.75rem/1.45 "IBM Plex Mono", monospace;
    }

    .profile-details dt {
      color: #71807b;
    }

    .profile-details dd {
      color: #183b3b;
      text-align: right;
    }

    .profile-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }

    .profile-action-button,
    .profile-delete-button {
      padding: 0.6rem 0.75rem;
      background: transparent;
      font: 0.7rem "IBM Plex Mono", monospace;
      cursor: pointer;
    }

    .profile-action-button {
      border: 1px solid #183b3b;
      color: #183b3b;
    }

    .profile-delete-button {
      border: 1px solid #b33928;
      color: #b33928;
    }

    .profile-form {
      display: grid;
      gap: 0.75rem;
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid #d1ccbf;
    }

    .profile-form label {
      display: grid;
      gap: 0.35rem;
      color: #4f5b58;
      font: 0.72rem "IBM Plex Mono", monospace;
    }

    .profile-form input {
      padding: 0.65rem;
      border: 1px solid #b9b6a9;
      background: #fffdf7;
      font: 0.8rem "IBM Plex Mono", monospace;
    }

    .profile-message {
      margin: 1rem 0 0;
      color: #2d7652;
      font: 0.78rem/1.5 "IBM Plex Mono", monospace;
    }

    .logout-button {
      padding: 0.55rem 0.75rem;
      border: 1px solid #d4512d;
      background: transparent;
      color: #d4512d;
      font: 500 0.72rem "IBM Plex Mono", monospace;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .account-actions {
      display: flex;
      gap: 0.6rem;
      align-items: center;
    }

    .back-button {
      padding: 0.55rem 0.75rem;
      border: 1px solid #183b3b;
      background: transparent;
      color: #183b3b;
      font: 500 0.72rem "IBM Plex Mono", monospace;
      cursor: pointer;
    }

    .logout-button:hover {
      background: #d4512d;
      color: #fffaf1;
    }

    .option-list {
      display: grid;
      gap: 0.75rem;
      margin-top: 2rem;
    }

    .members-section {
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid #d9d3c5;
    }

    .members-toggle {
      width: 100%;
      margin-top: 2rem;
      padding: 0.9rem 1rem;
      border: 1px solid #183b3b;
      background: #183b3b;
      color: #f7f4ec;
      font: 500 0.78rem "IBM Plex Mono", monospace;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .members-toggle:hover {
      background: #2b5957;
    }

    .member-list {
      display: grid;
      gap: 0.6rem;
      margin-top: 0.9rem;
    }

    .empty-members {
      margin: 0;
      padding: 1rem;
      background: #fffdf7;
      color: #71807b;
      font: 0.85rem/1.5 "IBM Plex Mono", monospace;
    }

    .member-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem;
      background: #fffdf7;
      border: 1px solid #d9d3c5;
    }

    .member-avatar {
      display: grid;
      width: 2rem;
      height: 2rem;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 50%;
      background: #183b3b;
      color: #efb443;
      font: 0.9rem "DM Serif Display", Georgia, serif;
    }

    .member-row strong,
    .member-row small {
      display: block;
    }

    .member-row strong {
      color: #183b3b;
      font: 0.82rem "IBM Plex Mono", monospace;
    }

    .member-row small {
      margin-top: 0.25rem;
      color: #71807b;
      font: 0.7rem "IBM Plex Mono", monospace;
    }

    .option-card {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 1rem;
      align-items: center;
      width: 100%;
      padding: 1rem;
      border: 1px solid #d9d3c5;
      background: #fffdf7;
      color: #183b3b;
      text-align: left;
      cursor: pointer;
      color: inherit;
      text-decoration: none;
    }

    .option-card:hover {
      border-color: #d4512d;
      background: #fff8ed;
    }

    strong,
    small {
      display: block;
    }

    strong {
      font: 1.05rem "IBM Plex Mono", monospace;
    }

    small {
      margin-top: 0.35rem;
      color: #71807b;
      font: 0.78rem/1.4 "IBM Plex Mono", monospace;
    }

    .recommended-badge {
      width: fit-content;
      margin: 0 0 0.45rem;
      padding: 0.2rem 0.45rem;
      background: #efb443;
      color: #183b3b;
      font-size: 0.62rem;
      letter-spacing: 0.06em;
      line-height: 1;
      text-transform: uppercase;
    }

    .arrow {
      color: #d4512d;
      font-size: 1.3rem;
    }

    .selection-note {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #183b3b;
      color: #f7f4ec;
    }

    .meeting-section {
      display: grid;
      gap: 1rem;
      margin-top: 2rem;
      padding: 1.25rem;
      border: 1px solid #d9d3c5;
      background: #fffdf7;
    }

    .meeting-section h2 {
      margin: 0.4rem 0;
    }

    .meeting-section p:last-child {
      margin: 0;
      color: #71807b;
      font: 0.78rem/1.5 "IBM Plex Mono", monospace;
    }

    .meeting-form {
      display: grid;
      gap: 0.75rem;
    }

    .meeting-toggle {
      width: fit-content;
      padding: 0.8rem 1rem;
      border: 0;
      background: #d4512d;
      color: #fffaf1;
      font: 500 0.78rem "IBM Plex Mono", monospace;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .meeting-form label {
      display: grid;
      gap: 0.35rem;
      color: #4f5b58;
      font: 0.72rem "IBM Plex Mono", monospace;
    }

    .meeting-form input,
    .meeting-form select {
      width: 100%;
      padding: 0.7rem;
      border: 1px solid #b9b6a9;
      background: #fffdf7;
      color: #183b3b;
      font: 0.8rem "IBM Plex Mono", monospace;
    }

    .meeting-fields {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }

    .scheduled-meeting {
      padding: 1rem;
      border-left: 3px solid #2d7652;
      background: #eef5ed;
    }

    .scheduled-meeting .eyebrow {
      color: #2d7652;
    }

    .scheduled-meeting strong {
      display: block;
      margin-top: 0.45rem;
      color: #183b3b;
    }

    .scheduled-meeting p:last-child {
      margin: 0.45rem 0 0;
      color: #4f5b58;
      font: 0.78rem/1.5 "IBM Plex Mono", monospace;
    }

    .meeting-link {
      display: inline-block;
      margin-top: 0.8rem;
      color: #d4512d;
      font: 500 0.78rem "IBM Plex Mono", monospace;
    }

    .notifications {
      margin-top: 2rem;
      padding: 1rem;
      border: 1px solid #efb443;
      background: #fff8ed;
    }

    .notifications a {
      display: block;
      margin-top: 0.5rem;
      color: #183b3b;
      font: 0.78rem/1.5 "IBM Plex Mono", monospace;
    }

    .selection-note .eyebrow {
      color: #efb443;
    }

    .selection-note p:last-child {
      margin: 0.4rem 0 0;
      font: 1rem "IBM Plex Mono", monospace;
    }

    .idea-form {
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid #d9d3c5;
    }

    .comments-toggle {
      width: 100%;
      margin-top: 2rem;
      padding: 0.9rem 1rem;
      border: 1px solid #183b3b;
      background: #183b3b;
      color: #f7f4ec;
      font: 500 0.78rem "IBM Plex Mono", monospace;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .comments-toggle:hover {
      background: #2b5957;
    }

    .comments-section {
      margin-top: 0.25rem;
    }

    h2 {
      margin: 0.5rem 0 1rem;
      color: #183b3b;
      font: 1.3rem "IBM Plex Mono", monospace;
    }

    textarea {
      display: block;
      width: 100%;
      resize: vertical;
      padding: 0.9rem;
      border: 1px solid #b9b6a9;
      background: #fffdf7;
      color: #183b3b;
      font: 0.9rem/1.5 "IBM Plex Mono", monospace;
    }

    .submit-button {
      margin-top: 0.75rem;
      padding: 0.8rem 1rem;
      border: 0;
      background: #d4512d;
      color: #fffaf1;
      font: 500 0.78rem "IBM Plex Mono", monospace;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .submit-button:hover {
      filter: brightness(1.08);
    }

    .idea-list {
      display: grid;
      gap: 0.6rem;
      margin-top: 1.25rem;
    }

    .idea-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin: 0;
      padding: 0.9rem;
      border-left: 3px solid #efb443;
      background: #fffdf7;
      color: #4f5b58;
      font: 0.85rem/1.5 "IBM Plex Mono", monospace;
    }

    .idea-item p {
      margin: 0;
    }

    .idea-item strong {
      margin-bottom: 0.35rem;
      color: #183b3b;
      font-size: 0.75rem;
    }

    .empty-comments {
      margin: 1.25rem 0 0;
      color: #71807b;
      font: 0.85rem/1.5 "IBM Plex Mono", monospace;
    }

    .delete-button {
      flex: 0 0 auto;
      padding: 0.45rem 0.6rem;
      border: 1px solid #b33928;
      background: transparent;
      color: #b33928;
      font: 0.68rem "IBM Plex Mono", monospace;
      cursor: pointer;
    }

    .comment-error {
      margin: 1rem 0 0;
      color: #b33928;
      font: 0.85rem/1.5 "IBM Plex Mono", monospace;
    }
  `]
})
export class DashboardComponent {
  protected readonly selectedOption = signal('');
  protected readonly profileOpen = signal(false);
  protected readonly profileEditing = signal(false);
  protected readonly profileMessage = signal('');
  protected readonly profileError = signal('');
  protected readonly ideas = signal<Comment[]>([]);
  protected readonly commentsOpen = signal(false);
  protected readonly commentError = signal('');
  protected readonly commentSyncError = signal('');
  private commentRevision = 0;
  protected readonly threads = computed(() => {
    const comments = this.ideas();
    const replies = new Map<number, Comment[]>();
    for (const comment of comments) {
      if (comment.parentId != null) {
        const group = replies.get(comment.parentId) || [];
        group.push(comment);
        replies.set(comment.parentId, group);
      }
    }
    return comments.filter(comment => comment.parentId == null)
      .map(comment => ({ ...comment, replies: replies.get(comment.id) || [] }));
  });
  protected readonly replyOpen = signal<number | null>(null);
  protected replyDrafts: Record<number, string> = {};
  protected readonly replySending = signal<number | null>(null);
  protected readonly replyError = signal('');
  protected ideaText = '';
  private readonly auth = inject(AuthService);
  protected userName = this.auth.account()!.name;
  protected userEmail = this.auth.account()!.email;
  protected readonly userRole = this.auth.account()!.role;
  protected readonly isAdmin = this.userRole === 'ADMIN';
  protected meetingTitle = '';
  protected meetingDate = '';
  protected meetingTime = '';
  protected meetingDuration = '1 hour';
  protected meetingPlatform = 'Zoom';
  protected meetingJoinUrl = '';
  protected readonly meetingOpen = signal(false);
  protected readonly scheduledMeeting = signal<Meeting | null>(null);
  protected readonly meetingError = signal('');
  protected readonly notifications = signal<Notification[]>([]);
  protected readonly members = signal<Member[]>([]);
  protected readonly membersError = signal('');
  protected readonly membersOpen = signal(false);
  protected readonly selectedMember = signal<string | null>(null);
  protected editName = this.userName;
  protected editEmail = this.userEmail;
  protected editPassword = '';

  constructor(private readonly http: HttpClient) {
    timer(0, 2000).pipe(
      exhaustMap(() => {
        const revision = this.commentRevision;
        return this.http.get<Comment[]>('/api/comments').pipe(
          timeout(10000),
          map(comments => ({ comments, revision })),
          catchError(() => {
            this.commentSyncError.set('Comments could not be updated. Retrying automatically…');
            return EMPTY;
          })
        );
      }),
      filter(result => result.revision === this.commentRevision),
      takeUntilDestroyed()
    ).subscribe(({ comments }) => {
      this.ideas.set(comments);
      this.commentSyncError.set('');
    });
    this.http.get<Notification[]>('/api/meetings/notifications').subscribe({
      next: (notifications) => this.notifications.set(notifications),
      error: () => this.meetingError.set('Meeting notifications could not be loaded.')
    });
    this.loadMembers();
  }

  protected logout(): void {
    this.http.post('/api/auth/logout', {}).subscribe({
      next: () => { this.auth.account.set(null); window.location.assign('/'); },
      error: () => this.profileError.set('Logout failed. Please try again.')
    });
  }

  protected goBack(): void {
    if (window.confirm('Do you want to log out and return to the login page?')) {
      this.logout();
    }
  }

  protected selectOption(option: 'church' | 'map' | 'about'): void {
    const labels = {
      church: 'Metsalu Church',
      map: 'Metsalu Map',
      about: 'About Metsalu'
    };

    this.selectedOption.set(labels[option]);
  }

  protected toggleComments(): void {
    this.commentsOpen.update((isOpen) => !isOpen);
  }

  private loadMembers(): void {
    this.http.get<Member[]>('/api/members').subscribe({
      next: members => { this.members.set(members); this.membersError.set(''); },
      error: () => this.membersError.set('Members could not be loaded. Close and reopen the member list to try again.')
    });
  }

  protected toggleMembers(): void {
    this.membersOpen.update(isOpen => !isOpen);
    if (this.membersOpen()) this.loadMembers();
  }

  protected toggleProfile(): void {
    this.profileOpen.update((isOpen) => !isOpen);
  }

  protected scheduleMeeting(): void {
    this.meetingError.set('');
    if (!this.isAdmin) {
      this.meetingError.set('Only admins can schedule meetings.');
      return;
    }
    this.http.post<Meeting>('/api/meetings', {
      title: this.meetingTitle.trim(),
      date: this.meetingDate,
      time: this.meetingTime,
      duration: this.meetingDuration,
      platform: this.meetingPlatform,
      joinUrl: this.meetingJoinUrl.trim()
    }).subscribe({
      next: (meeting) => {
        this.scheduledMeeting.set(meeting);
        this.notifications.update(items => [...items, { audience: 'All members', message: 'New meeting: ' + meeting.title, link: meeting.link! }]);
      },
      error: (error) => this.meetingError.set(error.error?.message || 'The meeting could not be scheduled. Please try again.')
    });
  }

  protected toggleMeetingForm(): void {
    this.meetingOpen.update((isOpen) => !isOpen);
  }

  protected toggleProfileEdit(): void {
    this.profileEditing.update((isEditing) => !isEditing);
    this.profileError.set('');
    this.profileMessage.set('');
    this.editName = this.userName;
    this.editEmail = this.userEmail;
    this.editPassword = '';
  }

  protected updateAccount(): void {
    this.profileError.set('');
    this.profileMessage.set('');
    this.http.put<AccountResponse>('/api/auth/account', {
      name: this.editName,
      email: this.editEmail,
      password: this.editPassword
    }).subscribe({
      next: (account) => {
        this.userName = account.name;
        this.userEmail = account.email;
        this.auth.account.set(account);
        this.editPassword = '';
        this.profileEditing.set(false);
        this.profileMessage.set('Profile updated successfully.');
      },
      error: (error) => this.profileError.set(error.error?.message || 'Profile could not be updated.')
    });
  }

  protected deleteAccount(): void {
    if (!window.confirm('Delete your account permanently?')) {
      return;
    }
    this.http.delete('/api/auth/account').subscribe({
      next: () => { this.auth.account.set(null); window.location.assign('/'); },
      error: () => this.profileError.set('Your account could not be deleted.')
    });
  }

  protected addIdea(): void {
    const idea = this.ideaText.trim();
    if (!idea) {
      return;
    }

    this.commentError.set('');
    this.http.post<Comment>('/api/comments', {
      text: idea
    }).subscribe({
      next: (comment) => {
        this.commentRevision++;
        this.ideas.update(ideas => [...ideas.filter(idea => idea.id !== comment.id), comment].sort((a, b) => a.id - b.id));
        this.ideaText = '';
      },
      error: () => this.commentError.set('Your comment could not be saved. Please start the backend and try again.')
    });
  }

  protected toggleReply(id: number): void {
    this.replyError.set('');
    this.replyOpen.set(this.replyOpen() === id ? null : id);
  }

  protected addReply(id: number): void {
    if (this.replySending() !== null) return;
    const text = (this.replyDrafts[id] || '').trim();
    if (!text) {
      this.replyError.set('Please write a reply.');
      return;
    }
    this.replyError.set('');
    this.replySending.set(id);
    this.http.post<Comment>(`/api/comments/${id}/replies`, { text }).pipe(timeout(10000)).subscribe({
      next: reply => {
        this.commentRevision++;
        this.ideas.update(ideas => [...ideas.filter(idea => idea.id !== reply.id), reply].sort((a, b) => a.id - b.id));
        this.replyDrafts[id] = '';
        this.replySending.set(null);
        if (this.replyOpen() === id) this.replyOpen.set(null);
      },
      error: error => {
        this.replySending.set(null);
        this.replyError.set(error.error?.message || 'Your reply could not be saved. Please try again.');
      }
    });
  }

  protected deleteIdea(id: number): void {
    this.commentError.set('');
    this.http.delete(`/api/comments/${id}`).subscribe({
      next: () => {
        this.commentRevision++;
        this.ideas.update(ideas => ideas.filter(idea => idea.id !== id && idea.parentId !== id));
      },
      error: () => this.commentError.set('Only admins can delete comments.')
    });
  }
}