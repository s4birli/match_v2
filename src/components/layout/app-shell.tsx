import Link from "next/link";
import {
  Home,
  CalendarDays,
  Wallet,
  Trophy,
  UserCircle2,
  Bell,
  Shield,
  Crown,
  LogOut,
  Building2,
  Layers3,
  Receipt,
  Ticket,
  MapPin,
  Users2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { GroupSwitcher } from "@/components/layout/group-switcher";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { logoutAction } from "@/server/actions/auth";
import type { SessionContext } from "@/server/auth/session";
import type { Role } from "@/lib/supabase/types";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
};

function buildNavForRole(role: Role | undefined, t: { nav: Record<string, string> }): {
  primary: NavItem[];
  secondary: { title: string; items: NavItem[] } | null;
} {
  // OWNER: completely separate workspace — no user/admin links at all.
  if (role === "owner") {
    return {
      primary: [
        { href: "/owner/dashboard", label: t.nav.dashboard, icon: Crown },
        { href: "/owner/tenants", label: t.nav.tenants, icon: Building2 },
        { href: "/owner/ledger", label: t.nav.ledger, icon: Wallet },
        { href: "/owner/archived", label: t.nav.archived, icon: Layers3 },
      ],
      secondary: null,
    };
  }

  // GROUP ADMIN: single flat list — all items reachable on mobile via the
  // horizontally-scrollable bottom nav, no hidden "secondary" section.
  if (role === "admin") {
    return {
      primary: [
        { href: "/admin/dashboard", label: t.nav.dashboard, icon: Home },
        { href: "/admin/matches", label: t.nav.matches, icon: CalendarDays },
        { href: "/admin/members", label: t.nav.members, icon: Users2 },
        { href: "/admin/venues", label: t.nav.venues, icon: MapPin },
        { href: "/admin/payments", label: t.nav.payments, icon: Receipt },
        { href: "/admin/stats", label: t.nav.stats, icon: Trophy },
        { href: "/admin/invites", label: t.nav.invites, icon: Ticket },
        { href: "/profile", label: t.nav.profile, icon: UserCircle2 },
      ],
      secondary: null,
    };
  }

  // ASSISTANT ADMIN: minimal admin workspace (no finance, no member mgmt).
  if (role === "assistant_admin") {
    return {
      primary: [
        { href: "/admin/dashboard", label: t.nav.dashboard, icon: Home },
        { href: "/admin/matches", label: t.nav.matches, icon: CalendarDays },
        { href: "/admin/stats", label: t.nav.stats, icon: Trophy },
        { href: "/profile", label: t.nav.profile, icon: UserCircle2 },
      ],
      secondary: null,
    };
  }

  // GUEST: minimal — own profile + matches they're invited to + own wallet.
  if (role === "guest") {
    return {
      primary: [
        { href: "/dashboard", label: t.nav.dashboard, icon: Home },
        { href: "/matches", label: t.nav.matches, icon: CalendarDays },
        { href: "/wallet", label: t.nav.wallet, icon: Wallet },
        { href: "/profile", label: t.nav.profile, icon: UserCircle2 },
      ],
      secondary: null,
    };
  }

  // USER (default).
  return {
    primary: [
      { href: "/dashboard", label: t.nav.dashboard, icon: Home },
      { href: "/matches", label: t.nav.matches, icon: CalendarDays },
      { href: "/wallet", label: t.nav.wallet, icon: Wallet },
      { href: "/stats", label: t.nav.stats, icon: Trophy },
      { href: "/profile", label: t.nav.profile, icon: UserCircle2 },
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
  // System owner is a special "no group" mode handled distinctly from membership roles.
  const role: Role | undefined = session.isSystemOwner ? "owner" : session.activeMembership?.role;
  const nav = buildNavForRole(role, t);

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
              const Icon = item.icon;
              const active = activePath?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/[0.08] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
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
                {nav.secondary.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={activePath?.startsWith(item.href)}
                  />
                ))}
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
            {!session.isSystemOwner && (
              <Link
                href="/notifications"
                data-testid="nav-notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-foreground transition-colors hover:bg-white/[0.08]"
                aria-label="Notifications"
              >
                <Bell size={16} />
              </Link>
            )}
            <LanguageToggle current={locale} />
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5">
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
                  className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                  aria-label="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="animate-fade-in space-y-5">{children}</main>
      </div>

      {/* Mobile bottom nav — horizontally scrollable so admins see ALL items.
          When ≤5 items the row is centered evenly; when more, it scrolls. */}
      <nav className="glass-strong fixed inset-x-3 bottom-3 z-50 lg:hidden">
        <div
          className={`no-scrollbar flex items-center gap-1 overflow-x-auto px-2 py-2 ${
            nav.primary.length <= 5 ? "justify-around" : "justify-start"
          }`}
        >
          {nav.primary.map((item) => {
            const Icon = item.icon;
            const active = activePath?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`bottom-nav-${item.label.toLowerCase()}`}
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  nav.primary.length <= 5 ? "flex-1" : "min-w-[64px]"
                } ${
                  active ? "bg-white/[0.1] text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white/[0.08] text-foreground"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}
