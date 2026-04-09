"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, X } from "lucide-react";
import { NAV_ICON_MAP, type NavIconName } from "./nav-icons";

export type MobileNavItem = {
  href: string;
  label: string;
  iconName: NavIconName;
};

/**
 * Mobile bottom nav.
 *
 * - Up to 5 items: shows them all equally spaced.
 * - 6+ items: shows the first N - 1 (config below) + a "More" trigger
 *   that opens a bottom sheet listing the remainder. This keeps tap
 *   targets at a comfortable size on iPhone SE (each cell is ~70px wide
 *   instead of ~36px) without losing access to anything.
 *
 * The split is "first N visible primary, rest in More" — the AppShell
 * already orders nav items by usage frequency so the most-used flow
 * stays one tap away.
 */
const VISIBLE_PRIMARY = 4; // first 4 surface as bar entries; rest go in "More"

export function MobileBottomNav({
  items,
  activePath,
}: {
  items: MobileNavItem[];
  activePath?: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet when the route changes (Link click).
  useEffect(() => {
    setMoreOpen(false);
  }, [activePath]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (moreOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [moreOpen]);

  const fitsAll = items.length <= 5;
  const visibleItems = fitsAll ? items : items.slice(0, VISIBLE_PRIMARY);
  const overflowItems = fitsAll ? [] : items.slice(VISIBLE_PRIMARY);

  // The activePath might point to an item that's tucked into the More
  // sheet — surface that visually so the user knows where they are.
  const overflowActive = overflowItems.some(
    (item) => activePath?.startsWith(item.href),
  );

  return (
    <>
      <nav
        data-testid="mobile-bottom-nav"
        className="glass-strong fixed inset-x-3 bottom-3 z-50 grid auto-cols-fr grid-flow-col items-stretch gap-0.5 px-2 py-1.5 lg:hidden"
      >
        {visibleItems.map((item) => {
          const Icon = NAV_ICON_MAP[item.iconName] ?? NAV_ICON_MAP.home;
          const active = activePath?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`bottom-nav-${item.label.toLowerCase()}`}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? "bg-white/[0.12] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04]"
              }`}
            >
              <Icon size={18} />
              <span className="w-full truncate text-center">{item.label}</span>
            </Link>
          );
        })}

        {overflowItems.length > 0 && (
          <button
            type="button"
            data-testid="bottom-nav-more"
            onClick={() => setMoreOpen(true)}
            aria-label="More navigation items"
            aria-expanded={moreOpen}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              overflowActive
                ? "bg-white/[0.12] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.04]"
            }`}
          >
            <MoreHorizontal size={18} />
            <span className="w-full truncate text-center">More</span>
          </button>
        )}
      </nav>

      {moreOpen && overflowItems.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-end lg:hidden"
          role="dialog"
          aria-modal="true"
          data-testid="mobile-nav-more-sheet"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="glass-strong relative w-full animate-slide-up rounded-t-3xl border-t border-white/10 px-4 pb-6 pt-4">
            <header className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                More
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </header>
            <ul className="grid grid-cols-3 gap-2">
              {overflowItems.map((item) => {
                const Icon = NAV_ICON_MAP[item.iconName] ?? NAV_ICON_MAP.home;
                const active = activePath?.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      data-testid={`bottom-nav-more-${item.label.toLowerCase()}`}
                      onClick={() => setMoreOpen(false)}
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-semibold transition-colors ${
                        active
                          ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                          : "border border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08]"
                      }`}
                    >
                      <Icon size={20} />
                      <span className="text-center leading-tight">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
