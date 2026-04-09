"use client";

import { useEffect, useState } from "react";
import { getDictionary, type Locale } from "@/lib/i18n/dictionaries";

function readLocaleFromCookie(): Locale {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)locale=(en|tr)/);
  return (m?.[1] as Locale) ?? "en";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(readLocaleFromCookie());
    console.error("[error.tsx]", error);
  }, [error]);

  const t = getDictionary(locale);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="glass space-y-4 p-6">
        <h1 className="text-xl font-bold">{t.errors.somethingWrong}</h1>
        <p className="text-sm text-muted-foreground">
          {error?.message ?? t.errors.generic}
        </p>
        {error?.digest ? (
          <p className="text-[10px] text-muted-foreground">
            {t.errors.digestLabel}: {error.digest}
          </p>
        ) : null}
        <button
          onClick={() => reset()}
          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          {t.errors.tryAgain}
        </button>
      </div>
    </div>
  );
}
