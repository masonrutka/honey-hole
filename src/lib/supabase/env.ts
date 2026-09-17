/**
 * Supabase configuration, and the question "is there a backend at all?".
 *
 * The app shipped for months as a purely static site and must keep working
 * that way when these variables are absent -- a local checkout with no
 * .env.local, a preview deployment that has not been given secrets, or a
 * production deploy where somebody mistyped a variable name. Nothing here
 * throws on import. Callers ask `isConfigured()` and fall back to the
 * read-only app, which is a worse experience but never a broken one.
 */

/**
 * Supabase renamed these keys: new projects issue a "publishable" key, older
 * ones an "anon" key. They are interchangeable here, and both are safe to send
 * to a browser -- Row Level Security, not key secrecy, is what protects the
 * data. Accept either name so the variable in Vercel does not have to match a
 * particular vintage of the dashboard.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function isConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
}
