"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setMyAttendanceAction } from "@/server/actions/matches";
import { useToast } from "@/components/ui/toast";

export function AttendanceQuickActions({ matchId }: { matchId: string }) {
  const { push } = useToast();
  const [pending, start] = useTransition();

  function set(status: "confirmed" | "declined" | "reserve") {
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      fd.set("status", status);
      const res = await setMyAttendanceAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else push({ title: "Attendance saved", tone: "success" });
    });
  }

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => set("confirmed")}
        data-testid="attendance-confirm"
      >
        I'm in
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => set("reserve")}
        data-testid="attendance-reserve"
      >
        Reserve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => set("declined")}
        data-testid="attendance-decline"
      >
        Decline
      </Button>
    </div>
  );
}
