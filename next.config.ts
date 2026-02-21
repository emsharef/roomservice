import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.inventory.gallery",
      },
    ],
  },
};

export default nextConfig;
