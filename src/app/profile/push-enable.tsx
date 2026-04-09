"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Asks the browser for push permission, registers a PushSubscription
 * against the SW, and POSTs it to /api/push/subscribe so notify() can
 * fan out to this device.
 *
 * VAPID public key is read from NEXT_PUBLIC_VAPID_PUBLIC_KEY. If empty
 * (local dev without keys) the button still works but the subscription
 * is recorded only — push delivery is a no-op until keys are set.
 */
export function PushEnableButton({
  labels = {
    enable: "Enable push notifications",
    disable: "Disable push notifications",
    unsupported: "This browser does not support web push notifications.",
  },
}: {
  labels?: { enable: string; disable: string; unsupported: string };
} = {}) {
  const { push: toast } = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setEnabled(!!sub);
      } catch {
        // ignore
      }
    })();
  }, []);

  async function enable() {
    if (!supported) return;
    setPending(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast({ title: "Permission denied", tone: "danger" });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapid
          ? (urlBase64ToUint8Array(vapid).buffer as ArrayBuffer)
          : undefined,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setEnabled(true);
      toast({ title: "Push notifications enabled", tone: "success" });
    } catch (err) {
      toast({ title: (err as Error).message, tone: "danger" });
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    if (!supported) return;
    setPending(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE" },
        );
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast({ title: "Push disabled", tone: "default" });
    } finally {
      setPending(false);
    }
  }

  if (supported === null) return null;
  if (!supported) {
    return <p className="text-xs text-muted-foreground">{labels.unsupported}</p>;
  }

  return enabled ? (
    <Button
      type="button"
      variant="secondary"
      onClick={disable}
      disabled={pending}
      data-testid="push-disable"
    >
      <BellOff size={14} /> {labels.disable}
    </Button>
  ) : (
    <Button
      type="button"
      onClick={enable}
      disabled={pending}
      data-testid="push-enable"
    >
      <Bell size={14} /> {labels.enable}
    </Button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
