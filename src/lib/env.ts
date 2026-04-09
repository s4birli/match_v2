function need(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  SUPABASE_URL: need("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:64321"),
  SUPABASE_ANON_KEY: need("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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

