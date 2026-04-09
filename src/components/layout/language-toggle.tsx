"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/server/actions/auth";

export function LanguageToggle({ current }: { current: "en" | "tr" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex h-10 items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
      {(["en", "tr"] as const).map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            data-testid={`lang-${lng}`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setLocaleAction(lng);
                router.refresh();
              })
            }
            className={`rounded-xl px-3 py-1 text-[11px] font-bold uppercase transition-colors ${
              active
                ? "bg-white/[0.12] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            }`}
          >
            {lng}
          </button>
        );
      })}
    </div>
  );
}
