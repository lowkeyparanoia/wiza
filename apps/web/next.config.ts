import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker / Cloud Run
  output: "standalone",

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.convex.cloud",
      },
    ],
  },

  experimental: {
    // Needed for Convex server actions
    serverActions: {
      allowedOrigins: ["localhost:3000", "localhost:3001"],
    },
  },
};

export default nextConfig;
