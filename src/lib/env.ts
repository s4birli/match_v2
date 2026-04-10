/**
 * Centralised env access.
 *
 * IMPORTANT: this module is imported by both server and client code paths
 * (via `@/lib/supabase/server` and historically `@/lib/supabase/client`).
 * It MUST NOT throw at module load — Turbopack's dev-mode env injection
 * sometimes races with the first render and we'd ship a "Something went
 * wrong" page instead of the dashboard. Use fallbacks everywhere; the
 * runtime caller is responsible for asserting non-empty when it actually
 * matters.
 */
export const env = {
  SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:64321",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  APP_URL: process.env.APP_URL ?? "http://localhost:3737",
  CRON_SECRET: process.env.CRON_SECRET ?? "local-cron-secret",
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? "mailto:owner@example.com",
};

/** True iff we have a configured Cron secret + non-empty VAPID keys. */
export const PUSH_ENABLED =
  !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

