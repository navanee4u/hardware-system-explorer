/**
 * auth.ts — Google sign-in gate (Auth.js / NextAuth v5).
 *
 * Fail-open by design: until AUTH_GOOGLE_ID/SECRET are configured, the Google
 * provider isn't registered and the middleware doesn't gate — so the app can't
 * lock everyone out mid-setup. Once the Google credentials are set, every route
 * requires a Google sign-in.
 *
 * Optional allowlist: set AUTH_ALLOWED_EMAILS (comma-separated) to restrict access
 * to specific Google accounts; leave it unset to allow any Google account.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const GOOGLE_CONFIGURED = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const allowlist = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: GOOGLE_CONFIGURED
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
      ]
    : [],
  callbacks: {
    signIn({ profile }) {
      if (allowlist.length === 0) return true; // any Google account
      const email = String(profile?.email ?? "").toLowerCase();
      return allowlist.includes(email);
    },
  },
});
