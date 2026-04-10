"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribes to one or more Postgres changes via Supabase Realtime and
 * triggers `router.refresh()` whenever a row matching the filter is
 * inserted / updated / deleted. The server component re-runs and the
 * page streams in fresh data without a hard reload — this is the
 * "live updates" the user asked for.
 *
 * Why router.refresh() instead of state surgery:
 *   - Server components are the source of truth in this app. Refreshing
 *     them is the simplest way to keep every derived view (dashboard,
 *     match detail, notifications, leaderboards) consistent with the DB.
 *   - The realtime payload itself is rarely enough to update a UI
 *     correctly (e.g. a vote count change requires re-aggregating).
 *
 * Debounced so a burst of updates (e.g. ten team-assign clicks in
 * 200ms) only triggers one refresh.
 *
 * Each entry in `tables` is a single subscription:
 *   { table, filter? }
 * `filter` uses Supabase Realtime's filter syntax:
 *   "match_id=eq.<uuid>", "tenant_id=eq.<uuid>", etc.
 *
 * Cleans up the channel on unmount or when the filter changes.
 */
export type RealtimeWatch = {
  table: string;
  /** Optional Supabase Realtime filter expression. */
  filter?: string;
  /** Restrict to one event type, otherwise listen for *. */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

export function useRealtimeRefresh(watches: RealtimeWatch[], opts?: { debounceMs?: number }) {
  const router = useRouter();
  const debounceMs = opts?.debounceMs ?? 250;

  // Stable key for the dependency array — the array identity changes on
  // every render but the contents usually don't.
  const watchKey = watches
    .map((w) => `${w.table}|${w.filter ?? ""}|${w.event ?? "*"}`)
    .join(";");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, debounceMs);
    };

    const channel = supabase.channel(`realtime:${watchKey}`);
    for (const w of watches) {
      // Supabase typings for postgres_changes are loose; we keep the
      // shape minimal so future Supabase upgrades don't break us.
      channel.on(
        "postgres_changes" as never,
        {
          event: w.event ?? "*",
          schema: "public",
          table: w.table,
          ...(w.filter ? { filter: w.filter } : {}),
        } as never,
        () => fire(),
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey, debounceMs, router]);
}

/**
 * Convenience: drop-in component that just mounts the hook. Useful for
 * server components that want to attach a live refresh without making
 * the whole page client-rendered.
 *
 * Usage:
 *   <LiveRefresh
 *     watches={[
 *       { table: "match_participants", filter: `match_id=eq.${id}` },
 *       { table: "pre_match_poll_votes", filter: `poll_id=eq.${pollId}` },
 *     ]}
 *   />
 */
export function LiveRefresh(props: {
  watches: RealtimeWatch[];
  debounceMs?: number;
}) {
  useRealtimeRefresh(props.watches, { debounceMs: props.debounceMs });
  return null;
}
