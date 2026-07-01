import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// `next dev`'s Fast Refresh bundles are eval()-wrapped (webpack's dev
// devtool), and HMR needs a WebSocket back to the dev server — both are
// blocked by the strict production CSP, which silently kills all client-side
// interactivity in `npm run dev` (confirmed live: hydration completes, but
// every onClick/useState-driven update no-ops with zero console error, since
// the browser reports CSP script-execution blocks via securitypolicyviolation,
// not a normal console.error). Neither relaxation applies to the production
// build, which doesn't use eval() and doesn't need HMR.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co${isDev ? " ws://localhost:*" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This project's parent directory has its own lockfiles (a separate,
  // unrelated workspace) — pin the tracing root here so Next doesn't infer
  // the wrong workspace root from them.
  outputFileTracingRoot: __dirname,
  experimental: {
    // Keep the build deterministic and fast for the engine + UI workspace.
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
