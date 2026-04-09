"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setMyAttendanceAction } from "@/server/actions/matches";
import { useToast } from "@/components/ui/toast";

/**
 * Per product rule: the admin decides who plays. A regular user can only:
 *   - pull themselves to RESERVE ("I might play but I'm not committed")
 *   - DECLINE ("I can't play")
 *
 * They never set their own status to `confirmed` — that is the admin's call
 * (admin/matches/new + AddParticipantForm seeds participants as confirmed).
 */
export function AttendanceQuickActions({
  matchId,
  currentStatus,
}: {
  matchId: string;
  currentStatus?: string | null;
}) {
  const { push } = useToast();
  const [pending, start] = useTransition();

  function set(status: "declined" | "reserve") {
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      fd.set("status", status);
      const res = await setMyAttendanceAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else
        push({
          title: status === "reserve" ? "Pulled to reserve" : "You're out",
          tone: "success",
        });
    });
  }

  const onReserve = currentStatus === "reserve";
  const onDeclined = currentStatus === "declined";

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button
        size="sm"
        variant={onReserve ? "default" : "secondary"}
        disabled={pending || onReserve}
        onClick={() => set("reserve")}
        data-testid="attendance-reserve"
      >
        {onReserve ? "On reserve" : "Pull to reserve"}
      </Button>
      <Button
        size="sm"
        variant={onDeclined ? "destructive" : "outline"}
        disabled={pending || onDeclined}
        onClick={() => set("declined")}
        data-testid="attendance-decline"
      >
        {onDeclined ? "Declined" : "I can't play"}
      </Button>
    </div>
  );
}
