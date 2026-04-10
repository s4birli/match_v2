"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Top-bar bell with a live unread-count badge.
 *
 * - Hydrates from `initialCount` so the very first paint is correct
 *   (server-rendered via the queries.countUnreadNotifications helper).
 * - Subscribes to Supabase Realtime on the user's own membership row
 *   in `notifications` and bumps the count on every INSERT, decrements
 *   on every UPDATE that flips is_read=true. This means a push that
 *   arrived while the bell is on screen updates the badge in real time.
 * - Caps the visible number at 99+ so the badge stays compact.
 */
export function NotificationsBell({
  membershipId,
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
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Realtime postgres_changes respects RLS. The notifications table
      // policy requires an authenticated user, so the channel needs the
      // session JWT BEFORE we subscribe — otherwise the row events are
      // dropped silently and the badge never updates.
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (accessToken) {
        // Newer @supabase/realtime-js exposes this on the realtime sub-client.
        try {
          (
            supabase.realtime as unknown as { setAuth(token: string): void }
          ).setAuth(accessToken);
        } catch {
          /* older clients pick the JWT from the session automatically */
        }
      }
      if (cancelled) return;

      channel = supabase.channel(`bell:${membershipId}`);
      channel.on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `membership_id=eq.${membershipId}`,
        } as never,
        (payload: { new: { is_read?: boolean } }) => {
          if (!payload.new?.is_read) {
            setCount((c) => Math.min(c + 1, 99));
          }
        },
      );
      channel.on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `membership_id=eq.${membershipId}`,
        } as never,
        (payload: { new: { is_read?: boolean }; old: { is_read?: boolean } }) => {
          // Unread → read = decrement.
          if (payload.old?.is_read === false && payload.new?.is_read === true) {
            setCount((c) => Math.max(c - 1, 0));
          }
        },
      );
      channel.subscribe((status) => {
        // eslint-disable-next-line no-console
        if (status === "SUBSCRIBED") console.log("[bell] realtime subscribed");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // eslint-disable-next-line no-console
          console.warn("[bell] realtime channel status:", status);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [membershipId]);

  // When the user navigates to /notifications all rows get marked read
  // server-side; we hide the badge optimistically here so the click feels
  // instant. The realtime UPDATE event re-syncs us if the server result
  // differs.
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
