import { cookies, headers } from "next/headers";
import { defaultLocale, getDictionary, locales, type Locale } from "./dictionaries";

export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("locale")?.value as Locale | undefined;
  if (fromCookie && (locales as readonly string[]).includes(fromCookie)) {
    return fromCookie;
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
