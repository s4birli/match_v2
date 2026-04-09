"use client";

import * as React from "react";
import { defaultLocale, getDictionary, type Dictionary, type Locale } from "./dictionaries";

const I18nContext = React.createContext<{ locale: Locale; t: Dictionary } | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ locale, t: getDictionary(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Returns the resolved dictionary on the client. Falls back to the default
 * locale if used outside an `<I18nProvider>` (so unit tests / storybook
 * snapshots don't crash).
 */
export function useI18n(): { locale: Locale; t: Dictionary } {
  const ctx = React.useContext(I18nContext);
  if (ctx) return ctx;
  return { locale: defaultLocale, t: getDictionary(defaultLocale) };
}

/**
 * Translates a server-action `errorKey` returned in `{ error: "..." }` shape
 * by looking it up in `t.errors`. If the key is unknown (e.g. an unexpected
 * raw string from older code paths) the original value is returned so the
 * user still sees something instead of a blank toast.
 *
 * Optional `params` substitutes `{name}` placeholders in the resolved string,
 * e.g. `translateError(t, "matchNotOverYet", { minutes: 5 })` for messages
 * that need a number/value baked in.
 */
export function translateError(
  t: Dictionary,
  key: string | undefined | null,
  params?: Record<string, string | number>,
): string {
  if (!key) return t.errors.generic;
  const errors = t.errors as unknown as Record<string, string>;
  const template = errors[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}
