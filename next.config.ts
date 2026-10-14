import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return ["/card/:path*", "/api/wallet/:path*", "/admin/:path*"].map(
      (source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      }),
    );
  },
  // Native module — keep it out of the server bundle (loaded at runtime).
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default config;
