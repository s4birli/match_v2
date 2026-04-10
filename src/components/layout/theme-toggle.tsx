"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, Check, ChevronDown } from "lucide-react";
import { setThemeAction } from "@/server/actions/auth";
import type { ThemeChoice } from "@/lib/theme/server";

/**
 * Three-state theme picker (light / dark / system).
 *
 * Why three states: every modern app does this and "system" is the only
 * way to honour OS-level dark mode without forcing the user to flip a
 * switch every morning.
 *
 * Behaviour:
 *   - Click to open the menu, click a row to switch.
 *   - The choice is persisted in a cookie via setThemeAction.
 *   - We also flip the `dark` class on `<html>` immediately on the client
 *     so the change is instant — the cookie write + revalidate happen
 *     in the background.
 *   - When choice = "system" we re-evaluate `prefers-color-scheme` and
 *     subscribe to changes for the lifetime of the toggle.
 *
 * The button face shows the icon of the *resolved* mode, not the choice,
 * so the user always sees what they're currently looking at.
 */
function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Re-apply when system pref changes (only matters for "system" mode).
  useEffect(() => {
    if (choice !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [choice]);

  // Outside click + Esc to close.
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

  function pick(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
    setOpen(false);
    start(async () => {
      await setThemeAction(next);
    });
  }

  // Resolved face icon — what is the user currently *looking at*.
  const resolvedDark =
    choice === "dark" ||
    (choice === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const Face = resolvedDark ? Moon : Sun;

  const options: Array<{
    value: ThemeChoice;
    label: string;
    Icon: typeof Sun;
  }> = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="theme-toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-3 text-[11px] font-bold uppercase text-foreground transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.08]"
      >
        <Face size={14} className="opacity-80" />
        <ChevronDown size={12} className="opacity-70" />
      </button>

      {open && (
        <ul
          role="listbox"
          data-testid="theme-menu"
          className="glass-strong absolute right-0 top-full z-50 mt-2 min-w-[160px] overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/10 p-1 shadow-xl"
        >
          {options.map(({ value, label, Icon }) => {
            const active = choice === value;
            return (
              <li key={value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-testid={`theme-${value}`}
                  onClick={() => pick(value)}
                  disabled={pending}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    active
                      ? "bg-slate-200 dark:bg-white/[0.10] text-foreground"
                      : "text-muted-foreground hover:bg-slate-200/70 dark:hover:bg-white/[0.06] hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={14} />
                    <span>{label}</span>
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
