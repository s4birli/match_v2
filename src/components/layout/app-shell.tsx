import Link from "next/link";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { GroupSwitcher } from "@/components/layout/group-switcher";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { resolveThemeChoice } from "@/lib/theme/server";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { countUnreadNotifications } from "@/server/db/queries";
import { NAV_ICON_MAP, type NavIconName } from "@/components/layout/nav-icons";
import { logoutAction } from "@/server/actions/auth";
import type { SessionContext } from "@/server/auth/session";
import type { Role } from "@/lib/supabase/types";

type NavItem = {
  href: string;
  label: string;
  iconName: NavIconName;
};

function buildNavForRole(role: Role | undefined, t: { nav: Record<string, string> }): {
  primary: NavItem[];
  secondary: { title: string; items: NavItem[] } | null;
} {
  // OWNER: completely separate workspace — no user/admin links at all.
  if (role === "owner") {
    return {
      primary: [
        { href: "/owner/dashboard", label: t.nav.dashboard, iconName: "crown" },
        { href: "/owner/tenants", label: t.nav.tenants, iconName: "building" },
        { href: "/owner/ledger", label: t.nav.ledger, iconName: "wallet" },
        { href: "/owner/archived", label: t.nav.archived, iconName: "layers" },
      ],
      secondary: null,
    };
  }

  // GROUP ADMIN: single flat nav, ordered by usage frequency. Admin is
  // also a player so personal "wallet" lives in the same nav as admin
  // tooling. Mobile bottom nav can show every item via auto-cols-fr.
  if (role === "admin") {
    return {
      primary: [
        // Most used (daily) ──────────────
        { href: "/admin/dashboard", label: t.nav.dashboard, iconName: "home" },
        { href: "/admin/matches", label: t.nav.matches, iconName: "calendar" },
        { href: "/admin/members", label: t.nav.members, iconName: "users" },
        { href: "/admin/payments", label: t.nav.payments, iconName: "receipt" },
        { href: "/wallet", label: t.nav.wallet, iconName: "wallet" },
        { href: "/admin/stats", label: t.nav.stats, iconName: "trophy" },
        // Less used ─────────────────────
        { href: "/admin/venues", label: t.nav.venues, iconName: "pin" },
        { href: "/admin/invites", label: t.nav.invites, iconName: "ticket" },
        { href: "/admin/settings", label: t.nav.settings, iconName: "settings" },
        { href: "/profile", label: t.nav.profile, iconName: "profile" },
      ],
      secondary: null,
    };
  }

  // ASSISTANT ADMIN: match-ops admin (no finance, no members, no invites).
  if (role === "assistant_admin") {
    return {
      primary: [
        { href: "/admin/dashboard", label: t.nav.dashboard, iconName: "home" },
        { href: "/admin/matches", label: t.nav.matches, iconName: "calendar" },
        { href: "/admin/venues", label: t.nav.venues, iconName: "pin" },
        { href: "/admin/stats", label: t.nav.stats, iconName: "trophy" },
        { href: "/wallet", label: t.nav.wallet, iconName: "wallet" },
        { href: "/profile", label: t.nav.profile, iconName: "profile" },
      ],
      secondary: null,
    };
  }

  // GUEST: minimal — own profile + matches they're invited to + own wallet.
  if (role === "guest") {
    return {
      primary: [
        { href: "/dashboard", label: t.nav.dashboard, iconName: "home" },
        { href: "/matches", label: t.nav.matches, iconName: "calendar" },
        { href: "/wallet", label: t.nav.wallet, iconName: "wallet" },
        { href: "/profile", label: t.nav.profile, iconName: "profile" },
      ],
      secondary: null,
    };
  }

  // USER (default).
  return {
    primary: [
      { href: "/dashboard", label: t.nav.dashboard, iconName: "home" },
      { href: "/matches", label: t.nav.matches, iconName: "calendar" },
      { href: "/wallet", label: t.nav.wallet, iconName: "wallet" },
      { href: "/stats", label: t.nav.stats, iconName: "trophy" },
      { href: "/profile", label: t.nav.profile, iconName: "profile" },
    ],
    secondary: null,
  };
}

export async function AppShell({
  session,
  children,
  activePath,
}: {
  session: SessionContext;
  children: React.ReactNode;
  activePath?: string;
}) {
  const { t, locale } = await getServerDictionary();
  const themeChoice = await resolveThemeChoice();
  // System owner is a special "no group" mode handled distinctly from membership roles.
  const role: Role | undefined = session.isSystemOwner ? "owner" : session.activeMembership?.role;
  const nav = buildNavForRole(role, t);
  // Bell unread badge — only meaningful for non-owner roles since the
  // owner workspace doesn't surface notifications.
  const unreadCount = session.isSystemOwner || !session.activeMembership
    ? 0
    : await countUnreadNotifications(session.activeMembership.id);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 pb-32 pt-6 lg:flex-row lg:gap-8 lg:px-8">
      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-6 lg:flex lg:h-[calc(100dvh-3rem)] lg:w-64 lg:flex-col lg:gap-3 lg:self-start">
        <div className="glass p-5">
          <Link href={nav.primary[0]?.href ?? "/dashboard"} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-600 text-lg font-black text-emerald-950">
              ⚽
            </div>
            <div>
              <p className="text-sm font-semibold">{t.common.appName}</p>
              <p className="text-[11px] text-muted-foreground">{t.common.tagline}</p>
            </div>
          </Link>
          <div className="mt-5 flex flex-col gap-1">
            {nav.primary.map((item) => {
              const Icon = NAV_ICON_MAP[item.iconName];
              const active = activePath?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-200/80 dark:bg-white/[0.08] text-foreground"
                      : "text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {nav.secondary && (
            <>
              <div className="mt-6 section-title">{nav.secondary.title}</div>
              <div className="flex flex-col gap-1">
                {nav.secondary.items.map((item) => {
                  const Icon = NAV_ICON_MAP[item.iconName];
                  const active = activePath?.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-slate-200/80 dark:bg-white/[0.08] text-foreground"
                          : "text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-white/[0.04] hover:text-foreground"
                      }`}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col gap-5">
        {/* Top bar */}
        <header className="glass flex flex-wrap items-center justify-between gap-3 p-3.5">
          <GroupSwitcher session={session} />
          <div className="flex items-center gap-2">
            {!session.isSystemOwner && session.activeMembership && (
              <NotificationsBell
                membershipId={session.activeMembership.id}
                initialCount={unreadCount}
                ariaLabel={t.nav.notifications}
              />
            )}
            <ThemeToggle initial={themeChoice} />
            <LanguageToggle current={locale} />
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-3 py-1.5">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials(session.person.display_name)}</AvatarFallback>
              </Avatar>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-xs font-semibold leading-tight">
                  {session.person.display_name}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">{session.account.email}</p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  data-testid="logout-button"
                  className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-foreground"
                  aria-label={t.common.logout}
                >
                  <LogOut size={14} />
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="animate-fade-in space-y-5">{children}</main>
      </div>

      {/* Mobile bottom nav — first 4 items + a "More" sheet for the rest. */}
      <MobileBottomNav items={nav.primary} activePath={activePath} />

    </div>
  );
}

// (SidebarLink removed — desktop sidebar now renders inline against NAV_ICON_MAP.)
