"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setMyAttendanceAction } from "@/server/actions/matches";
import { addParticipantsAction } from "@/server/actions/admin-participants";

export function AddParticipantForm({
  matchId,
  candidates,
}: {
  matchId: string;
  candidates: Array<{ id: string; displayName: string }>;
}) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function add(membershipId: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      fd.append("membershipIds", membershipId);
      const res = await addParticipantsAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Added", tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {candidates.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
        >
          <span className="text-sm font-semibold">{c.displayName}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => add(c.id)}
            data-testid={`add-participant-${c.id}`}
          >
            Add
          </Button>
        </li>
      ))}
    </ul>
  );
}
