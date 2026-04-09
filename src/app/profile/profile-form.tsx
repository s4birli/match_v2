"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction } from "@/server/actions/admin";

const POSITIONS = [
  { code: "goalkeeper", label: "Goalkeeper" },
  { code: "defender", label: "Defender" },
  { code: "midfield", label: "Midfield" },
  { code: "forward", label: "Forward" },
] as const;

export function ProfileForm({
  initialDisplayName,
  initialPositions,
}: {
  initialDisplayName: string;
  initialPositions: string[];
}) {
  const { push } = useToast();
  const [pending, start] = useTransition();

  function action(formData: FormData) {
    start(async () => {
      const res = await updateProfileAction(formData);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else push({ title: "Profile saved", tone: "success" });
    });
  }

  return (
    <Card>
      <form action={action} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={initialDisplayName}
            data-testid="profile-display-name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Positions</Label>
          <div className="grid grid-cols-2 gap-2">
            {POSITIONS.map((p) => (
              <label
                key={p.code}
                className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm hover:bg-white/[0.08]"
              >
                <input
                  type="checkbox"
                  name={`position-${p.code}`}
                  defaultChecked={initialPositions.includes(p.code)}
                  className="h-4 w-4 accent-emerald-500"
                  data-testid={`position-${p.code}`}
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={pending} data-testid="profile-save">
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Card>
  );
}
