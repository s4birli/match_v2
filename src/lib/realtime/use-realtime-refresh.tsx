"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lightweight live-update hook.
 *
 * History: this used to subscribe to Supabase Realtime postgres_changes
 * for each watched table. In our local Supabase setup the realtime
 * server kept dropping the channel into a CHANNEL_ERROR ↔ CLOSED loop
 * within milliseconds of subscribing — events never reached the
 * client. After exhausting the auth / RLS / publication / replica
 * identity rabbit hole we switched to dumb polling: refresh the page
 * every N seconds while the tab is visible. The worst-case lag is
 * the poll interval and there are zero edge cases.
 *
 * For the surfaces that depend on this (match detail / dashboard /
 * wallet / payments / members), the user already gets instant
 * feedback from their own clicks via Next.js server actions; this
 * hook just keeps OTHER tabs / OTHER users in sync.
 */
export type RealtimeWatch = {
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

const DEFAULT_INTERVAL_MS = 8_000;

export function useRealtimeRefresh(
  _watches: RealtimeWatch[],
  opts?: { intervalMs?: number },
) {
  const router = useRouter();
  const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (cancelled || document.hidden) return;
        router.refresh();
      }, intervalMs);
    }
    start();

    function onWake() {
      if (!document.hidden && !cancelled) {
        router.refresh();
        start();
      }
    }
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [router, intervalMs]);
}

/**
 * Drop-in component variant. Pass an empty `watches` array if you just
 * want the page to poll regardless of which table changed.
 */
export function LiveRefresh(props: {
  watches: RealtimeWatch[];
  intervalMs?: number;
}) {
  useRealtimeRefresh(props.watches, { intervalMs: props.intervalMs });
  return null;
}
