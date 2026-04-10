"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { switchActiveTenantAction } from "@/server/actions/auth";
import type { SessionContext } from "@/server/auth/session";

export function GroupSwitcher({ session }: { session: SessionContext }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // System owner: dedicated label, no switcher (they don't belong to any group).
  if (session.isSystemOwner) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 px-3 py-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-base font-black text-violet-950">
          ⚡
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">System owner</p>
          <p className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-200/80">
            global control
          </p>
        </div>
      </div>
    );
  }

  const active = session.activeMembership;
  if (!active) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-3 py-2">
        <span className="text-xs text-muted-foreground">No group</span>
      </div>
    );
  }

  // Single-group user: render a static badge — no dropdown to switch into.
  if (session.memberships.length <= 1) {
    return (
      <div
        data-testid="group-static"
        className="flex items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-3 py-2"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-violet-600 text-base font-black text-emerald-950">
          {active.tenant.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {active.tenant.name}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {active.role.replace("_", " ")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          data-testid="group-switcher"
          className="flex items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-3 py-2 text-left transition-colors hover:bg-slate-200/70 dark:hover:bg-white/[0.06]"
          disabled={pending}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-violet-600 text-base font-black text-emerald-950">
            {active.tenant.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{active.tenant.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {active.role.replace("_", " ")}
            </p>
          </div>
          <ChevronDown size={14} className="text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-[100] min-w-[260px] rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-950/95 p-1.5 shadow-xl backdrop-blur-xl"
        >
          {session.memberships.map((m) => (
            <DropdownMenu.Item
              key={m.id}
              data-testid={`group-option-${m.tenant.slug}`}
              onSelect={() =>
                start(async () => {
                  await switchActiveTenantAction(m.tenant_id);
                  router.refresh();
                })
              }
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.08]"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200/80 dark:bg-white/[0.08] text-xs font-bold">
                {m.tenant.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{m.tenant.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.role.replace("_", " ")}
                </p>
              </div>
              {m.id === active.id ? <Check size={14} className="text-emerald-300" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
