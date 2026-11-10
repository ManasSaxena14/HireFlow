import type { NextConfig } from 'next';

// In development the settings live in the .env file at the root, shared with the API.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // No file, as on a host. The host's own settings are used.
}

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  // The browser only talks to this site. This keeps the login cookie working
  // even when the API runs on a different domain.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default config;
