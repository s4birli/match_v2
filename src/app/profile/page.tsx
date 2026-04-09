import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireMembership } from "@/server/auth/session";
import { listPositionPreferences } from "@/server/db/queries";
import { initials } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ProfileForm } from "./profile-form";
import { PushEnableButton } from "./push-enable";

export default async function ProfilePage() {
  const { session, membership } = await requireMembership();
  const { t, locale } = await getServerDictionary();
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

      <Card>
        <h2 className="mb-3 text-base font-semibold">Language</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Saved on your account — applies on every device next time you sign in.
        </p>
        <LanguageToggle current={locale} />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Notifications</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Enable push so we can ping your phone 1 hour before kickoff and
          when ratings open after a match.
        </p>
        <PushEnableButton />
      </Card>

      <ProfileForm
        initialDisplayName={session.person.display_name}
        initialPositions={positionCodes}
      />
    </AppShell>
  );
}
