"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { createInviteLinkAction, regenerateInviteCodeAction } from "@/server/actions/admin";

export function InviteActions() {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function newLink() {
    start(async () => {
      const res = await createInviteLinkAction();
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.inviteCreated, tone: "success" });
        router.refresh();
      }
    });
  }

  function regenerate() {
    start(async () => {
      const res = await regenerateInviteCodeAction();
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.codeRegenerated, tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button onClick={newLink} disabled={pending} data-testid="create-invite-link">
        + Create invite link
      </Button>
      <Button variant="secondary" onClick={regenerate} disabled={pending} data-testid="regenerate-code">
        Regenerate code
      </Button>
    </div>
  );
}
