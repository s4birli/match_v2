"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { archiveMembershipAction, restoreMembershipAction } from "@/server/actions/admin";

export function ArchiveMemberButton({ id }: { id: string }) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  function archive() {
    start(async () => {
      const fd = new FormData();
      fd.set("membershipId", id);
      fd.set("excludeFromStats", "on");
      const res = await archiveMembershipAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Archived", tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={archive} data-testid={`archive-${id}`}>
      Archive
    </Button>
  );
}

export function RestoreMemberButton({ id }: { id: string }) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  function restore() {
    start(async () => {
      const fd = new FormData();
      fd.set("membershipId", id);
      fd.set("includeInStats", "on");
      const res = await restoreMembershipAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Restored", tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={restore} data-testid={`restore-${id}`}>
      Restore
    </Button>
  );
}
