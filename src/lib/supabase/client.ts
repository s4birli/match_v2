"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * We deliberately bypass `@/lib/env` here because that helper throws on
 * missing variables, which can race with Turbopack's dev-mode env
 * injection during cold starts. Reading `process.env.NEXT_PUBLIC_*`
 * directly is what Next.js bakes at build time anyway.
 *
 * Both vars MUST be set; if they aren't, fail with a clear runtime
 * error so we don't silently render with `undefined` and crash deeper.
 */
export function createSupabaseBrowserClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:64321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — restart `npm run dev` after editing .env.local",
    );
  }
  return createBrowserClient(url, anonKey);
}
