import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's dev server blocks its own client resources (HMR, chunks) when they
  // are requested cross-origin. Testing on a phone over the LAN counts as
  // cross-origin, and without this React never hydrates there -- links still
  // work, but anything interactive silently does not. Dev-only; ignored in
  // production builds.
  allowedDevOrigins: ["10.141.34.70", "localhost", "127.0.0.1"],
};

export default nextConfig;
