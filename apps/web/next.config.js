/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@agenthub/shared", "@agenthub/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
