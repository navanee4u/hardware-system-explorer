/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SSE route handlers must not be statically optimized.
  experimental: {},
};

export default nextConfig;
