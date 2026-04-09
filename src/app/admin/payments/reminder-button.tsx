"use client";

import { useTransition } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendPaymentReminderAction } from "@/server/actions/admin";

export function ReminderButton({ membershipId }: { membershipId: string }) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      const fd = new FormData();
      fd.set("membershipId", membershipId);
      const res = await sendPaymentReminderAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Reminder sent", tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={send}
      disabled={pending}
      data-testid={`reminder-${membershipId}`}
    >
      <Bell size={14} /> Remind
    </Button>
  );
}
