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

const csv = (v?: string) =>
  (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const allowedEmails = csv(process.env.AUTH_ALLOWED_EMAILS);
const allowedDomains = csv(process.env.AUTH_ALLOWED_DOMAINS); // e.g. "rapidflare.ai"

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
      // No restriction configured → any Google account.
      if (allowedEmails.length === 0 && allowedDomains.length === 0) return true;
      // Trust only Google-verified emails for allowlisting.
      if (profile?.email_verified === false) return false;
      const email = String(profile?.email ?? "").toLowerCase();
      const domain = email.split("@")[1] ?? "";
      return allowedEmails.includes(email) || allowedDomains.includes(domain);
    },
  },
});
