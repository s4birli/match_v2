import { cookies, headers } from "next/headers";
import { defaultLocale, getDictionary, locales, type Locale } from "./dictionaries";
import { getSessionContext } from "@/server/auth/session";

/**
 * Resolution order:
 *   1. cookie set by the language toggle (works pre-login too)
 *   2. logged-in account.preferred_language (cross-device persistence)
 *   3. browser Accept-Language header
 *   4. defaultLocale ("en")
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("locale")?.value as Locale | undefined;
  if (fromCookie && (locales as readonly string[]).includes(fromCookie)) {
    return fromCookie;
  }
  try {
    const session = await getSessionContext();
    const fromAccount = session?.account.preferred_language as Locale | undefined;
    if (fromAccount && (locales as readonly string[]).includes(fromAccount)) {
      return fromAccount;
    }
  } catch {
    // Ignore — fall through to header detection.
  }
  const headerStore = await headers();
  const accept = headerStore.get("accept-language") ?? "";
  const first = accept.split(",")[0]?.split("-")[0]?.toLowerCase() as Locale | undefined;
  if (first && (locales as readonly string[]).includes(first)) {
    return first;
  }
  return defaultLocale;
}

export async function getServerDictionary() {
  const locale = await resolveLocale();
  return { locale, t: getDictionary(locale) };
}
