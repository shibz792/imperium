import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads its standard-14 font metrics (.afm files) from disk at
  // runtime via a computed path relative to its own __dirname — bundling
  // it (Next's default for server-side dependencies) rewrites that path
  // against a virtual module root, so the font files 404 at runtime even
  // though they're really sitting in node_modules. Excluding it from
  // bundling makes Next require() it natively instead, where __dirname
  // still points at the real, on-disk package — confirmed this exact
  // failure mode and fix by generating a brochure PDF end-to-end.
  serverExternalPackages: ["pdfkit"],
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
