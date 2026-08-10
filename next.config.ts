import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next's own default is 1MB — too small for a single phone-camera
    // photo, which is why property photo uploads were failing outright.
    // Capped at 4mb rather than higher: Vercel's Serverless Functions
    // enforce a hard 4.5MB request body ceiling of their own that this
    // config can't raise, so anything above it would 413 at the platform
    // level regardless. Photos are also downscaled client-side before
    // upload (see PropertyPhotoUploader.tsx) so this is a safety margin,
    // not the primary fix.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
