# Metsalu community application

Angular frontend and Spring Boot backend for member profiles, comments, and meeting invitations.

## Run locally

Use Java 17 or newer and a Node version supported by the installed Angular CLI.

In one terminal:

```sh
cd backend
mvn spring-boot:run
```

In another terminal:

```sh
cd frontend
npm ci
npm start
```

Open http://localhost:4200. Restart both servers after upgrading: Angular's development proxy forwards `/api` requests to port 8080. The browser now uses an HTTP-only session cookie; older local-storage login flags are ignored, so sign in again.

## Accounts and existing data

Public registration always creates a member. Admin roles are managed by the database owner, never through registration or request headers. Existing account roles are preserved; review previously self-registered admins before exposing the application publicly. To grant a trusted existing account admin access, use an authenticated database administration connection:

```sql
UPDATE accounts SET role = 'ADMIN' WHERE email = 'trusted-person@example.com';
```

Passwords are salted PBKDF2 hashes. On the first backend restart, existing plaintext passwords are migrated transactionally; a schema marker prevents rehashing them on subsequent starts. Users keep their existing passwords. Back up `backend/data` with the backend stopped before an upgrade. Existing backups can still contain plaintext passwords and should be protected accordingly.

The default database path is `./data/metsalu`, relative to the backend working directory. Starting with `cd backend` retains the original `backend/data/metsalu` database. Override `DATABASE_URL`, `DATABASE_USERNAME`, and `DATABASE_PASSWORD` when needed. Tests always use in-memory databases.

Account changes and deletion apply only to the authenticated account. Changing email or password invalidates older sessions. Logout and deletion invalidate the current session; idle sessions expire after 30 minutes.

## Meetings

An admin first creates a call in Zoom, Google Meet, or Microsoft Teams, then enters its HTTPS invitation URL when scheduling here. This application shares the invitation; it does not create provider calls or host video. Existing meetings without a call URL display a message asking members to contact the organizer.

## Deployment

For the prepared Vercel frontend and Render backend configuration with Neon PostgreSQL, follow [DEPLOYMENT.md](DEPLOYMENT.md).

Serve the frontend and proxy `/api/` to Spring Boot under the same HTTPS origin. Configure SPA fallback to `index.html` for frontend routes. Set `FRONTEND_ORIGIN` to the public frontend origin and `SESSION_COOKIE_SECURE=true` under HTTPS. The production frontend uses relative API paths, and new meeting/notification links use the current site's origin.

## Checks

```sh
cd backend
mvn test
```

```sh
cd frontend
npm run build
```

Backend tests cover authentication, CSRF, role enforcement, account ownership, password migration, stable comment deletion, meeting validation, and the health endpoint. There is currently no Angular unit-test target configured. The build reports an existing dashboard stylesheet size warning.

Authentication and password handling use Spring Security; see its [password storage](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html) and [CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) documentation.

## One-to-one voice calls

Open **Voice Call** from the dashboard. Both members must sign in with separate accounts. Incoming calls appear on any page while the application is open. Select a member, allow microphone access, and have the other member accept. The call supports mute, decline, cancel, and hang-up. Use HTTPS (the ngrok URL) or localhost for microphone access.

Audio uses WebRTC between browsers; the backend exchanges private call setup data and does not record audio. Calls and availability are held in memory and end when the backend restarts. Unanswered calls expire after 60 seconds; abandoned sessions expire after 90 seconds. Navigating within the application preserves a call. Refreshing or closing the browser tab ends the local audio connection.

The default STUN server helps discover direct connections. **ngrok does not relay WebRTC audio.** For networks that block direct connections, configure a TURN service when starting the backend:

- `VOICE_TURN_URL`: the provider's `turn:` or `turns:` URL
- `VOICE_TURN_USERNAME`: the provider's username
- `VOICE_TURN_CREDENTIAL`: the provider's password
- `VOICE_STUN_URL`: optional override for the default STUN server

These values belong in the server environment, not source control. TURN client credentials are necessarily delivered to signed-in browsers; use restricted or expiring provider credentials. No TURN service is bundled or provisioned. See the [WebRTC connection guide](https://webrtc.org/getting-started/peer-connections) for STUN/TURN behavior.

Voice regression tests are included in `mvn test`. `frontend/scripts/voice-smoke.cjs` exercises real WebRTC between two Chrome processes with fake microphones, including bidirectional audio packets, mute, decline, and cleanup. Run it only against an isolated test database (it creates two test accounts). It defaults to `http://localhost:14200`; set `VOICE_TEST_URL`, `CHROME_PATH`, and `PLAYWRIGHT_MODULE` as needed. The last verification used a temporary backend on 18080 with `jdbc:h2:mem:voice-check` and a frontend proxy to that backend. No cross-network or TURN-relayed call has been verified.

## Member Text and Call actions

Open **View members** on the dashboard and select another member. **Text** opens a private in-app conversation; **Call** opens the Voice Call page with that member selected. Text messages are not SMS. The recipient can open your name in the member list to read and answer. Open conversations refresh every two seconds and show the latest 100 messages.

Each account has a stable random member ID. Changing an email does not break conversations. The server determines the sender from the authenticated session and returns only the conversation between that sender and the selected recipient. Account deletion removes associated private messages.

The Call option retains the existing voice-call requirements: the other member must be signed in with the application open, and some networks require a TURN relay. If unavailable, you can send a text from the selected-member call page.

`frontend/scripts/messages-smoke.cjs` tests three-account messaging, privacy, persistence, and selected-member voice calling against an isolated database. Configure `PLAYWRIGHT_MODULE`, `CHROME_PATH`, and `MESSAGE_TEST_URL` as needed, as for the voice smoke test. Do not run it against real accounts: the script creates temporary test accounts in its target database.


### Online calling

Selecting a member's **Call** action now checks availability and starts the call automatically. Incoming calls appear in a floating prompt on the dashboard, messages, or other pages. A signed-out member is reported as not online. Closing a tab or losing the connection can take up to approximately 15 seconds to be reflected in the online list. Use **Try call again** after a member returns. Navigating between app pages keeps an active call connected; logout ends it.

The `frontend/scripts/global-calls-smoke.cjs` test verifies automatic member calling, a dashboard incoming-call prompt, real browser audio connectivity, navigation during a call, offline feedback, and retry after login, using an isolated database and fake microphones.
