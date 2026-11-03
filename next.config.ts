import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
      // Prompts stay readable Markdown in prompts/ and are bundled as strings,
      // so no runtime file reads (Cloudflare Workers has no project filesystem).
      "*.md": { type: "text" },
    },
  },
};

export default nextConfig;
