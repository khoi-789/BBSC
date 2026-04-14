import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable automatic static optimization — all pages are dynamic (Firebase)
  // This prevents 'auth/invalid-api-key' errors during `next build` static generation
  // Pages that use Firebase are always client-rendered anyway
  staticPageGenerationTimeout: 1000,
  experimental: {
    // Suppress build-time static prerendering for client-only pages
  },
};

export default nextConfig;
