import type { NextConfig } from "next";

// Security headers. 'unsafe-inline' scripts are needed for Next's inline
// bootstrap. A nonce-based CSP would be stricter. Dev also needs 'unsafe-eval'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const nextConfig: NextConfig = {
  // No Next.js dev badge on the page, so demos look like the real thing.
  devIndicators: false,
  poweredByHeader: false,
  // The reader page moved from /r/<reader> to /brief/<reader>. Old links keep
  // working through a permanent redirect, which runs before the password gate.
  async redirects() {
    return [{ source: "/r/:path*", destination: "/brief/:path*", permanent: true }]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ]
  },
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
