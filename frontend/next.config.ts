import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server bundle for small Docker images / any Node host.
  output: 'standalone',
};

export default nextConfig;
