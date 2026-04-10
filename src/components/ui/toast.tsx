"use client";

import * as React from "react";

type Toast = { id: number; title: string; description?: string; tone: "default" | "success" | "danger" };

const ToastContext = React.createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid="toast"
            className={`pointer-events-auto w-full max-w-sm animate-slide-up rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl ${
              t.tone === "success"
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100"
                : t.tone === "danger"
                  ? "border-red-400/30 bg-red-500/15 text-red-700 dark:text-red-100"
                  : "border-slate-200 dark:border-white/15 bg-slate-900/80 text-foreground"
            }`}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.description ? <p className="text-xs opacity-80">{t.description}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
