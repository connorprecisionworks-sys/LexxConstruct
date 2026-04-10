import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "lexx_auth";

/** Paths that never require authentication */
const PUBLIC_EXACT = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  // Static assets handled by Next.js internals — the matcher config excludes _next/static
  // and _next/image already, but guard anything else that looks like a file asset
  if (/\.(ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|otf)$/.test(pathname)) return true;
  return false;
}

async function verifyCookie(value: string, secret: string): Promise<boolean> {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const payload = value.slice(0, dotIndex);
  const sigB64 = value.slice(dotIndex + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      new TextEncoder().encode(payload)
    );
    if (!valid) return false;
    const { expiresAt } = JSON.parse(atob(payload)) as { expiresAt: number };
    return Date.now() < expiresAt;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Fail closed: misconfigured server → deny all access
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue && (await verifyCookie(cookieValue, secret))) {
    return NextResponse.next();
  }

  // For API routes return 401 (caller expects JSON, not an HTML redirect)
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // For page routes redirect to login, preserving the original destination
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Run on everything except Next.js static files and image optimizer
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
