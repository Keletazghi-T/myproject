// Set RENDER_API_ORIGIN in Vercel, e.g. the HTTPS origin shown by your Render service.
const value = process.env.RENDER_API_ORIGIN;
if (!value) throw new Error('Set RENDER_API_ORIGIN to the HTTPS origin of your Render backend before deploying.');
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
