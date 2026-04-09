"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createFundCollectionAction } from "@/server/actions/admin";

export function CreateFundForm({
  members,
  currencyCode,
}: {
  members: Array<{ id: string; name: string }>;
  currencyCode: string;
}) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickAll() {
    setPicked(new Set(members.map((m) => m.id)));
  }
  function clearAll() {
    setPicked(new Set());
  }

  function action(fd: FormData) {
    if (picked.size === 0) {
      push({ title: "Pick at least one member.", tone: "danger" });
      return;
    }
    fd.delete("membershipIds");
    for (const id of picked) fd.append("membershipIds", id);
    start(async () => {
      const res = await createFundCollectionAction(fd);
      if (res?.error) {
        push({ title: res.error, tone: "danger" });
      } else {
        push({
          title: `Charged ${res?.charged ?? 0} members`,
          tone: "success",
        });
        setPicked(new Set());
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fund-name">Name</Label>
          <Input
            id="fund-name"
            name="name"
            required
            placeholder="Equipment box · Feb"
            data-testid="fund-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fund-amount">Per member ({currencyCode})</Label>
          <Input
            id="fund-amount"
            name="amountPerMember"
            type="number"
            min="0.01"
            step="0.01"
            required
            data-testid="fund-amount"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fund-description">Description (optional)</Label>
          <Input
            id="fund-description"
            name="description"
            placeholder="New balls + bibs"
            data-testid="fund-description"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>
            Charge whom? <span className="text-emerald-300">{picked.size}</span> /{" "}
            {members.length}
          </Label>
          <div className="flex gap-2 text-[11px]">
            <button
              type="button"
              onClick={pickAll}
              className="text-emerald-300 hover:underline"
            >
              All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-muted-foreground hover:text-foreground"
            >
              None
            </button>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {members.map((m) => {
            const isOn = picked.has(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  data-testid={`fund-pick-${m.id}`}
                  className={`w-full truncate rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    isOn
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                      : "border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
                  }`}
                >
                  {m.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Button type="submit" disabled={pending} data-testid="fund-submit">
        {pending ? "Charging…" : `Charge ${picked.size} member${picked.size === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}
