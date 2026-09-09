# Metsalu frontend

See the [application README](../README.md) for setup, session authentication, migration, and deployment details.

- `npm ci` installs dependencies.
- `npm start` serves the app on port 4200 and proxies `/api` to the backend on port 8080.
- `npm run build` creates a production bundle in `dist/frontend`.

There is no Angular unit-test or end-to-end target configured. Backend regression tests run with `mvn test` from `../backend`.
