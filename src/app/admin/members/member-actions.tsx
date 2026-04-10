"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import {
  archiveMembershipAction,
  restoreMembershipAction,
  startGuestConversionAction,
} from "@/server/actions/admin";

export function ArchiveMemberButton({ id }: { id: string }) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function archive() {
    start(async () => {
      const fd = new FormData();
      fd.set("membershipId", id);
      fd.set("excludeFromStats", "on");
      const res = await archiveMembershipAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.memberArchived, tone: "success" });
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
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function restore() {
    start(async () => {
      const fd = new FormData();
      fd.set("membershipId", id);
      fd.set("includeInStats", "on");
      const res = await restoreMembershipAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.memberRestored, tone: "success" });
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

/**
 * Convert a guest into a registered member without losing any history.
 * Opens a small popover, takes the new user's email, generates an invite
 * URL the admin can share. When the invitee registers via that URL, the
 * server re-links the existing person + membership instead of inserting
 * new rows — every match_participants / ledger / rating / motm row that
 * already references this membership stays intact.
 */
export function ConvertGuestButton({ id }: { id: string }) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  // UX-5: Esc closes the modal. Click-outside is already handled by the
  // backdrop button. Keyboard users get the same affordance.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setEmail("");
        setGeneratedUrl(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function submit() {
    if (!email) return;
    start(async () => {
      const fd = new FormData();
      fd.set("membershipId", id);
      fd.set("email", email);
      const res = await startGuestConversionAction(fd);
      if ("error" in res) {
        push({ title: translateError(t, res.error), tone: "danger" });
        return;
      }
      setGeneratedUrl(res.url);
      push({ title: t.toasts.inviteLinkReady, tone: "success" });
      router.refresh();
    });
  }

  function copy() {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl).then(
      () => push({ title: t.toasts.copied, tone: "success" }),
      () => push({ title: t.toasts.copyFailed, tone: "danger" }),
    );
  }

  function close() {
    setOpen(false);
    setEmail("");
    setGeneratedUrl(null);
  }

  return (
    <>
      <Button
        size="sm"
        variant="accent"
        onClick={() => setOpen(true)}
        data-testid={`convert-guest-${id}`}
      >
        <UserPlus size={14} />
        Convert
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          aria-modal="true"
          role="dialog"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="glass-strong relative w-full max-w-md animate-slide-up rounded-3xl p-5">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t.admin.convertGuestTitle}</h3>
              <button
                type="button"
                onClick={close}
                aria-label={t.admin.cancelBtn}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] text-muted-foreground hover:bg-slate-200 dark:hover:bg-white/[0.08]"
              >
                <X size={14} />
              </button>
            </header>
            <p className="mb-3 text-xs text-muted-foreground">{t.admin.convertGuestHint}</p>

            {!generatedUrl ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="convert-email">{t.common.email}</Label>
                  <Input
                    id="convert-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="player@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="convert-email"
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={submit}
                    disabled={pending || !email}
                    className="flex-1"
                    data-testid="convert-submit"
                  >
                    {pending ? t.admin.generating : t.admin.generateInviteLink}
                  </Button>
                  <Button variant="ghost" onClick={close}>
                    {t.admin.cancelBtn}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-200">
                    {t.admin.shareInviteWith.replace("{email}", email)}
                  </p>
                  <code
                    className="block break-all rounded-lg bg-black/30 px-3 py-2 text-xs"
                    data-testid="convert-url"
                  >
                    {generatedUrl}
                  </code>
                  <Button size="sm" variant="secondary" onClick={copy}>
                    <Copy size={14} /> Copy link
                  </Button>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" onClick={close}>
                    {t.admin.done}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
