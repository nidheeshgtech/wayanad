import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  images: { remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }] },
};

export default nextConfig;
