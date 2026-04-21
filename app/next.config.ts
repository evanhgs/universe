import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const clerkDevHost = "https://*.clerk.accounts.dev";
const clerkImagesHost = "https://img.clerk.com";
const clerkChallengesHost = "https://challenges.cloudflare.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${clerkDevHost} ${clerkChallengesHost}${
    isDevelopment ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${clerkImagesHost}`,
  "font-src 'self' data:",
  `connect-src 'self' ${clerkDevHost}`,
  "worker-src 'self' blob:",
  `frame-src 'self' ${clerkChallengesHost}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  !isDevelopment ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
