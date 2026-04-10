"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe, Check, ChevronDown } from "lucide-react";
import { setLocaleAction } from "@/server/actions/auth";
import {
  locales,
  localeLabels,
  localeFlags,
  type Locale,
} from "@/lib/i18n/dictionaries";

/**
 * Language picker — dropdown with all configured locales (en / tr / es ...).
 *
 * Behaviour:
 *   - Click to open the menu, click a row to switch.
 *   - Closes on outside click or Esc.
 *   - Calls `setLocaleAction(locale)` which writes the cookie + persists
 *     the choice on `accounts.preferred_language`, then triggers a
 *     server-side refresh so the dictionary re-renders.
 *
 * The button shows the active language's flag + ISO code so it stays
 * compact in the top bar even with three or more languages configured.
 */
export function LanguageToggle({ current }: { current: Locale }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Outside click + Esc to close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(lng: Locale) {
    if (lng === current) {
      setOpen(false);
      return;
    }
    start(async () => {
      await setLocaleAction(lng);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="lang-toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-3 text-[11px] font-bold uppercase text-foreground transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.08]"
      >
        <Globe size={14} className="opacity-70" />
        <span>{localeFlags[current]}</span>
        <span>{current.toUpperCase()}</span>
        <ChevronDown size={12} className="opacity-70" />
      </button>

      {open && (
        <ul
          role="listbox"
          data-testid="lang-menu"
          className="glass-strong absolute right-0 top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/10 p-1 shadow-xl"
        >
          {locales.map((lng) => {
            const active = current === lng;
            return (
              <li key={lng}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-testid={`lang-${lng}`}
                  onClick={() => pick(lng)}
                  disabled={pending}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    active
                      ? "bg-slate-200 dark:bg-white/[0.10] text-foreground"
                      : "text-muted-foreground hover:bg-slate-200/70 dark:hover:bg-white/[0.06] hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{localeFlags[lng]}</span>
                    <span>{localeLabels[lng]}</span>
                  </span>
                  {active ? <Check size={14} className="text-emerald-300" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
