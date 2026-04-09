import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, currency = "GBP", locale = "en-GB") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(date: Date | string, locale = "en-GB") {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateShort(date: Date | string, locale = "en-GB") {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(d);
}

export function formatTime(date: Date | string, locale = "en-GB") {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Map an app `Locale` to the BCP-47 tag the Intl APIs expect.
 * Centralised so adding a new language is one place. The fallback is en-GB
 * because that's what `formatCurrency` / `formatDate` defaulted to before.
 */
export function bcp47Locale(locale: string): string {
  switch (locale) {
    case "tr":
      return "tr-TR";
    case "es":
      return "es-ES";
    case "en":
    default:
      return "en-GB";
  }
}

/**
 * Build the public-facing display name from a first + last name pair.
 * Format: "Mehmet Y." — first name in full + last name's initial + dot.
 *
 * Why this format: lots of football groups have multiple players with the
 * same first name, so we need *some* disambiguator, but full last names
 * feel formal and bloat the small avatar / row layouts. The user picked
 * first + initial as the right balance.
 *
 * Edge cases:
 *   - Empty/whitespace last name → returns just the first name.
 *   - Multi-part last name ("De La Cruz") → first letter of the first
 *     part: "Carlos D."
 *   - Both empty → "?"
 */
export function formatDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (!f && !l) return "?";
  if (!l) return f;
  const initial = l[0]?.toUpperCase() ?? "";
  return initial ? `${f} ${initial}.` : f;
}

export function initials(name: string | null | undefined) {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function relativeFromNow(date: Date | string, locale = "en") {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}
