"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Mounts once at the app root and:
 *   1. Registers /sw.js so we get push + offline.
 *   2. Listens for `beforeinstallprompt` and surfaces an install banner
 *      that the user can dismiss (sticky for the session).
 *
 * Renders nothing on iOS Safari (which doesn't fire beforeinstallprompt)
 * but the SW still registers.
 */
type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstaller() {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore — push/offline simply won't be available.
      });
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as DeferredPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || dismissed) return null;

  return (
    <div
      data-testid="pwa-install-banner"
      className="fixed inset-x-3 bottom-20 z-40 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 backdrop-blur-xl lg:bottom-6 lg:right-6 lg:left-auto lg:max-w-sm"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-600 text-lg">
        ⚽
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install Match Club</p>
        <p className="text-[11px] text-muted-foreground">
          Add it to your home screen for a one-tap launch.
        </p>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await deferred.prompt();
          setDeferred(null);
        }}
      >
        <Download size={14} /> Install
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
        onClick={() => setDismissed(true)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
