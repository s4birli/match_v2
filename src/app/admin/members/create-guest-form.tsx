"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createGuestMemberAction } from "@/server/actions/admin";

export function CreateGuestForm() {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await createGuestMemberAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Guest created", tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" required data-testid="guest-name" />
      </div>
      <Button type="submit" disabled={pending} data-testid="guest-create">
        {pending ? "Adding…" : "Add guest"}
      </Button>
    </form>
  );
}
