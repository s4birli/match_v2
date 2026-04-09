"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction } from "@/server/actions/admin";

const POSITION_CODES = ["goalkeeper", "defender", "midfield", "forward"] as const;

export function ProfileForm({
  initialDisplayName,
  initialPositions,
  labels,
}: {
  initialDisplayName: string;
  initialPositions: string[];
  labels: {
    displayName: string;
    positionsTitle: string;
    positionGoalkeeper: string;
    positionDefender: string;
    positionMidfield: string;
    positionForward: string;
    saving: string;
    saveChanges: string;
    saved: string;
  };
}) {
  const { push } = useToast();
  const [pending, start] = useTransition();

  const positionLabels: Record<(typeof POSITION_CODES)[number], string> = {
    goalkeeper: labels.positionGoalkeeper,
    defender: labels.positionDefender,
    midfield: labels.positionMidfield,
    forward: labels.positionForward,
  };

  function action(formData: FormData) {
    start(async () => {
      const res = await updateProfileAction(formData);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else push({ title: labels.saved, tone: "success" });
    });
  }

  return (
    <Card>
      <form action={action} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="displayName">{labels.displayName}</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={initialDisplayName}
            data-testid="profile-display-name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>{labels.positionsTitle}</Label>
          <div className="grid grid-cols-2 gap-2">
            {POSITION_CODES.map((code) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm hover:bg-white/[0.08]"
              >
                <input
                  type="checkbox"
                  name={`position-${code}`}
                  defaultChecked={initialPositions.includes(code)}
                  className="h-4 w-4 accent-emerald-500"
                  data-testid={`position-${code}`}
                />
                {positionLabels[code]}
              </label>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={pending} data-testid="profile-save">
          {pending ? labels.saving : labels.saveChanges}
        </Button>
      </form>
    </Card>
  );
}
