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
};
