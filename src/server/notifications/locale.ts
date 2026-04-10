import {
  defaultLocale,
  getDictionary,
  type Dictionary,
  type Locale,
} from "@/lib/i18n/dictionaries";
import type { NotificationType } from "@/lib/supabase/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Resolves a recipient's preferred dictionary so server-side notification
 * dispatch can ship localized title + body — both into the persisted
 * `notifications` row AND into the push payload.
 *
 * Why look up at notify time and freeze in the DB:
 *   - The push notification ships now and is received now; the title /
 *     body must already be in the user's language.
 *   - If the user later switches to another locale, the historical
 *     notification keeps the language it was sent in (matches every
 *     other email/SMS/push system the user has used).
 *
 * Falls back to `defaultLocale` if the membership has no account
 * (guest player without a real login) or the preference is unset.
 */
export async function dictForMembership(membershipId: string): Promise<{
  locale: Locale;
  t: Dictionary;
}> {
  try {
    const admin = createSupabaseServiceClient();
    const { data } = await admin
      .from("memberships")
      .select("person:persons(primary_account_id)")
      .eq("id", membershipId)
      .maybeSingle();
    const accountId = (data as { person?: { primary_account_id?: string } } | null)
      ?.person?.primary_account_id;
    if (accountId) {
      const { data: account } = await admin
        .from("accounts")
        .select("preferred_language")
        .eq("id", accountId)
        .maybeSingle();
      const lang = account?.preferred_language;
      if (lang === "en" || lang === "tr" || lang === "es") {
        return { locale: lang, t: getDictionary(lang) };
      }
    }
  } catch {
    /* fall through to default */
  }
  return { locale: defaultLocale, t: getDictionary(defaultLocale) };
}

/**
 * Substitutes `{name}` placeholders in a template string. Used by the
 * notification builder so callers can pass `{ amount: "£8", currency: "GBP" }`
 * and the dictionary entry can read "Match fee {amount} added".
 */
function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

/**
 * Resolves the localized title + body for a notification type. Each
 * notification_type maps to a single dictionary entry under
 * `t.notifications.types.<type>`. Callers may pass `params` to fill
 * placeholders in the template.
 *
 * If the type has no entry (e.g. an admin sends an ad-hoc notification
 * with a custom title), returns the caller-supplied fallback as-is.
 */
export function buildLocalizedNotification(
  t: Dictionary,
  type: NotificationType,
  fallback: { title: string; body: string },
  params?: Record<string, string | number>,
): { title: string; body: string } {
  const types = t.notifications.types as Record<
    string,
    { title: string; body: string } | undefined
  >;
  const entry = types[type];
  if (!entry) return fallback;
  return {
    title: fill(entry.title, params),
    body: fill(entry.body, params),
  };
}
