import type { NextConfig } from "next";

const acquisitionPaths = [
  "/",
  "/de",
  "/fr",
  "/reel-place-finder",
  "/save-places-from-reels",
  "/date-night-planner",
  "/trip-planner",
  "/alternatives",
  "/alternatives/plotline",
  "/alternatives/feedtrip",
  "/alternatives/reeltrip",
  "/alternatives/reeltravel",
  "/alternatives/google-maps-lists",
];

const legacyHost = {
  type: "host",
  value: String.raw`shelvr-web\.vercel\.app`,
} as const;

const nextConfig: NextConfig = {
  experimental: { globalNotFound: true },
  async redirects() {
    return acquisitionPaths.map((source) => ({
      source,
      destination: `https://tryshelvr.app${source}`,
      permanent: true,
      has: [legacyHost],
    }));
  },
};

export default nextConfig;
