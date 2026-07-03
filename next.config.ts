import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Native module — keep it out of the server bundle (loaded at runtime).
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default config;
