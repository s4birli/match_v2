import {
  Home,
  CalendarDays,
  Wallet,
  Trophy,
  UserCircle2,
  Bell,
  Shield,
  Crown,
  Building2,
  Layers3,
  Receipt,
  Ticket,
  MapPin,
  Users2,
  Star,
  Plus,
  Settings,
} from "lucide-react";

/**
 * Stable nav-icon registry. Server Components can't pass function references
 * across the server→client boundary, so navigation items reference icons by
 * string name. Both AppShell (server, desktop sidebar) and MobileBottomNav
 * (client, bottom bar) resolve the icon from this map.
 */
export const NAV_ICON_MAP = {
  home: Home,
  calendar: CalendarDays,
  wallet: Wallet,
  trophy: Trophy,
  profile: UserCircle2,
  bell: Bell,
  shield: Shield,
  crown: Crown,
  building: Building2,
  layers: Layers3,
  receipt: Receipt,
  ticket: Ticket,
  pin: MapPin,
  users: Users2,
  star: Star,
  plus: Plus,
  settings: Settings,
  cog: Settings,
} as const;

export type NavIconName = keyof typeof NAV_ICON_MAP;
