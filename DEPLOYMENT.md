# Vercel frontend + Render backend

Configuration is prepared; no cloud deployment has been created yet.

## Accounts and repository

Create Vercel, Render, and Neon accounts using GitHub sign-in. Create a private GitHub repository for this project and upload the source. The root `.gitignore` excludes local databases, backups, credentials, and generated files. Do not upload these files manually.

## Database and backend

1. Create a free Neon PostgreSQL database and open its connection details.
2. In Render, create a Blueprint from the GitHub repository. The root `render.yaml` creates a free Docker web service.
3. Supply the prompted environment variables:
   - `JDBC_DATABASE_URL`: `jdbc:postgresql://HOST/DATABASE?sslmode=require` using Neon's host and database name. Keep credentials separate.
   - `DATABASE_USERNAME`: Neon database role.
   - `DATABASE_PASSWORD`: Neon database password, stored only in Render's environment settings.
   - `FRONTEND_ORIGIN`: the exact production Vercel origin, for example `https://YOUR-PROJECT.vercel.app`. Update it after Vercel assigns the final domain.
4. Render activates the production profile, uses PostgreSQL, creates the schema, and binds to its assigned port. Verify `https://YOUR-SERVICE.onrender.com/api/health`.

Neon starts empty. Existing local H2 accounts, comments, and messages are **not migrated automatically**. Keep the local database and backups; arrange a verified data migration before switching existing users to the hosted application.

## Frontend and integration

1. Import the same GitHub repository in Vercel, with **Root Directory** set to `frontend`.
2. The API proxy in `frontend/vercel.json` points to `https://metsalu-api.onrender.com`. No frontend environment variable is required. Any old `RENDER_API_ORIGIN` setting is unused and can be removed.
3. Deploy. `vercel.json` configures the Angular build, output directory, API proxy, and client-side route fallback with literal destinations.
4. Set Render's `FRONTEND_ORIGIN` to the resulting Vercel production origin and let Render restart.
5. Visit the Vercel domain. Verify registration, login, member listing, comments/replies, private messages, and logout. Refresh a nested route to verify the SPA fallback. Test calls between two signed-in browsers.

Browser requests remain relative (`/api/...`). Vercel forwards them to Render, keeping authentication cookies on the frontend origin. Production cookies require HTTPS. CSRF protection remains enabled. Angular's `proxy.conf.json` is used only for local development.

## Limits and verification status

Render's free service can sleep when idle, causing a delay on the next request. Sessions and call presence are in memory; backend restarts end them. Database records are stored externally in Neon. A TURN service is still needed for voice calls on networks that cannot connect directly; configure the `VOICE_TURN_*` variables documented in README.md. Deployment alone does not provide an audio relay.

Local builds/tests do not verify the cloud proxy, Neon connection, Docker image, or cross-network calls. Verify those after deployment. Do not add database passwords, provider tokens, or TURN credentials to source control.

References: [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-ts), [external rewrites](https://vercel.com/docs/routing/rewrites), [Render Blueprints](https://render.com/docs/blueprint-spec), [Render free service limits](https://render.com/docs/free), [Neon JDBC connections](https://neon.com/docs/connect/connection-errors).
