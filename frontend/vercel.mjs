// Use the deployed backend by default; Vercel can override this for another environment.
const value = process.env.RENDER_API_ORIGIN?.trim() || 'https://metsalu-api.onrender.com';
const backend = new URL(value);
if (backend.protocol !== 'https:' || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) {
  throw new Error('RENDER_API_ORIGIN must be an HTTPS origin without credentials, a path, query, or fragment.');
}
export const config = {
  framework: 'angular',
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'dist/frontend/browser',
  rewrites: [
    { source: '/api/:path*', destination: `${backend.origin}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' }
  ],
  headers: [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }]
};
