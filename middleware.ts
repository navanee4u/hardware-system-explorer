/**
 * middleware.ts — gate every route behind Google sign-in.
 *
 * Fail-open: if Google isn't configured (no AUTH_GOOGLE_ID), nothing is gated, so
 * the app stays reachable during setup. Once configured, unauthenticated requests
 * are redirected to the Google sign-in page.
 */
import { auth } from "@/auth";

export default auth((req) => {
  if (!process.env.AUTH_GOOGLE_ID) return; // fail-open until Google is configured
  if (req.auth) return; // signed in → allow
  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return Response.redirect(signInUrl);
});

export const config = {
  // Gate everything except the auth endpoints, Next internals, and public assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|examples/).*)"],
};
