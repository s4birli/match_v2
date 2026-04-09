"use client";

import Link from "next/link";
import { NAV_ICON_MAP, type NavIconName } from "./nav-icons";

export type MobileNavItem = {
  href: string;
  label: string;
  iconName: NavIconName;
};

/**
 * Mobile bottom nav: ALL items always visible, equally spaced via
 * `grid grid-flow-col auto-cols-fr`. Tighter padding + smaller label as
 * the count grows so 8 admin items still fit a phone width without
 * scrolling or an overflow menu.
 */
export function MobileBottomNav({
  items,
  activePath,
}: {
  items: MobileNavItem[];
  activePath?: string;
}) {
  const count = items.length;
  // Adaptive sizing: more items → smaller padding + smaller label.
  const isDense = count >= 7;
  const padX = isDense ? "px-1" : "px-2";
  const padY = isDense ? "py-1.5" : "py-2";
  const labelSize = isDense ? "text-[9px]" : "text-[10px]";
  const iconSize = isDense ? 16 : 18;

  return (
    <nav
      data-testid="mobile-bottom-nav"
      className={`glass-strong fixed inset-x-3 bottom-3 z-50 grid auto-cols-fr grid-flow-col items-stretch gap-0.5 ${padX} ${padY} lg:hidden`}
    >
      {items.map((item) => {
        const Icon = NAV_ICON_MAP[item.iconName] ?? NAV_ICON_MAP.home;
        const active = activePath?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`bottom-nav-${item.label.toLowerCase()}`}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 font-semibold uppercase tracking-wider transition-colors ${labelSize} ${
              active
                ? "bg-white/[0.12] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.04]"
            }`}
          >
            <Icon size={iconSize} />
            <span className="w-full truncate text-center">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
