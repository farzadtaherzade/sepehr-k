/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: import.meta.dirname,
  // pg stays outside the bundler (optional native deps)
  serverExternalPackages: ['pg'],
  webpack(config, { isServer }) {
    if (isServer) {
      // instrumentation.ts / init-db.ts also pull in pg — keep it external there too
      config.externals.push({ pg: 'commonjs pg' });
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; " +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
