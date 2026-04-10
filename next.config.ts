import type { NextConfig } from "next";

// ── Startup environment variable validation ───────────────────────────────────
// Both auth variables must be set before the server starts.
// This check runs when next.config.ts is evaluated (dev server + production server + build).
// If a variable is missing you will see this error immediately instead of
// discovering it silently at runtime with everyone's data exposed.

if (!process.env.AUTH_PASSWORD) {
  throw new Error(
    "[Lexx] Missing required environment variable: AUTH_PASSWORD\n" +
    "→ Add AUTH_PASSWORD=<your-password> to .env.local for local development.\n" +
    "→ Add it as an environment variable in Railway / Vercel for production."
  );
}

if (!process.env.AUTH_SECRET) {
  throw new Error(
    "[Lexx] Missing required environment variable: AUTH_SECRET\n" +
    "→ Add AUTH_SECRET=<random-32+-char-string> to .env.local for local development.\n" +
    "→ Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}

const nextConfig: NextConfig = {};

export default nextConfig;
