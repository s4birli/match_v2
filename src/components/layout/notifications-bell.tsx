"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

/**
 * Top-bar bell with unread-count badge.
 *
 * Uses **polling** (10s interval) instead of Supabase Realtime
 * postgres_changes. We tried postgres_changes first, but the local
 * Supabase realtime service kept kicking the channel into a
 * CHANNEL_ERROR ↔ CLOSED loop within milliseconds of subscribing,
 * so the bell never received live events. Polling is simpler,
 * survives Fast Refresh / hot reload, and the worst-case 10s lag
 * is acceptable because the OS-level push notification fires
 * instantly anyway — the bell badge is just a visual reinforcement.
 *
 * Polling pauses when the tab is hidden (Page Visibility API) and
 * resumes immediately when the tab returns to focus, so we don't
 * waste cycles on backgrounded tabs.
 */
const POLL_MS = 10_000;

export function NotificationsBell({
  initialCount,
  ariaLabel,
}: {
  membershipId: string;
  initialCount: number;
  ariaLabel: string;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch("/api/me/notifications/unread-count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { count: number };
        if (!cancelled && typeof json.count === "number") {
          setCount(json.count);
        }
      } catch {
        /* network blip — try again next tick */
      }
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        await tick();
        if (!cancelled) schedule();
      }, POLL_MS);
    }

    // Initial fetch right after mount so the badge is fresh even if the
    // user just navigated in from another page (where a push might have
    // arrived while they weren't looking at this AppShell instance).
    void tick();
    schedule();

    // Re-poll immediately when the tab returns to foreground or the
    // window regains focus.
    function onWake() {
      if (!document.hidden && !cancelled) {
        void tick();
        schedule();
      }
    }
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);

  const visible = count > 0;

  return (
    <Link
      href="/notifications"
      data-testid="nav-notifications"
      className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] text-foreground transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.08]"
      aria-label={visible ? `${ariaLabel} (${count})` : ariaLabel}
    >
      <Bell size={16} />
      {visible && (
        <span
          data-testid="bell-badge"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-emerald-500 px-1 text-[10px] font-bold text-white shadow-sm"
        >
          {count >= 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
