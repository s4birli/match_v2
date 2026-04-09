import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireNonOwner } from "@/server/auth/session";
import { listPositionPreferences } from "@/server/db/queries";
import { initials } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const { session, membership } = await requireNonOwner();
  const { t } = await getServerDictionary();
  const positions = await listPositionPreferences(membership.id);
  const positionCodes = positions.map((p) => p.position_code);

  return (
    <AppShell session={session} activePath="/profile">
      <header>
        <h1 className="text-2xl font-bold">{t.nav.profile}</h1>
        <p className="text-sm text-muted-foreground">{session.account.email}</p>
      </header>

      <Card>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">
              {initials(session.person.display_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-bold">{session.person.display_name}</h2>
            <p className="text-xs text-muted-foreground">{membership.role}</p>
          </div>
        </div>
      </Card>

      <ProfileForm
        initialDisplayName={session.person.display_name}
        initialPositions={positionCodes}
      />
    </AppShell>
  );
}
