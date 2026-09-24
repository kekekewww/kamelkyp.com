/**
 * Studio navigation (admin-architecture §4.1). One source for the sidebar,
 * the mobile menu and the `g` + key shortcuts (§4.15).
 */

export interface StudioNavItem {
  label: string;
  to: string;
  /** Second key of the `g` chord (Go to …). */
  shortcut?: string;
  /** Exact match only (the Studio home). */
  end?: boolean;
  /** Which badge count to show next to the label. */
  count?: "attention" | "commissions";
}

export interface StudioNavGroup {
  label: string;
  items: StudioNavItem[];
}

export const STUDIO_NAV: readonly StudioNavGroup[] = [
  {
    // The home item stands alone at the top (no group label).
    label: "",
    items: [
      {
        label: "Home",
        to: "/studio",
        shortcut: "h",
        end: true,
        count: "attention",
      },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Projects", to: "/studio/projects", shortcut: "p" },
      { label: "Music", to: "/studio/music", shortcut: "m" },
      { label: "Recognition", to: "/studio/recognition", shortcut: "r" },
      { label: "Writing", to: "/studio/writing", shortcut: "w" },
      { label: "Services", to: "/studio/services", shortcut: "s" },
    ],
  },
  {
    label: "Site",
    items: [
      { label: "Homepage", to: "/studio/homepage", shortcut: "o" },
      { label: "Social links", to: "/studio/social", shortcut: "l" },
      { label: "Media", to: "/studio/media", shortcut: "d" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Brand", to: "/studio/settings/brand", shortcut: "," },
      { label: "Site", to: "/studio/settings/site" },
      { label: "Taxonomies", to: "/studio/settings/taxonomies" },
      { label: "Footer", to: "/studio/settings/footer" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Commissions", to: "/studio/commissions", count: "commissions" },
      { label: "Pricing", to: "/studio/services/pricing" },
      { label: "Terms", to: "/studio/services/terms" },
    ],
  },
];

/** `g` chord targets: key → path. */
export const GO_TO_SHORTCUTS: ReadonlyMap<string, string> = new Map(
  STUDIO_NAV.flatMap((group) => group.items)
    .filter((item) => item.shortcut)
    .map((item) => [item.shortcut as string, item.to]),
);

/** The nav item a pathname belongs to (longest matching prefix wins). */
export function activeNavItem(pathname: string): StudioNavItem | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  let best: StudioNavItem | null = null;
  for (const item of STUDIO_NAV.flatMap((group) => group.items)) {
    const match = item.end
      ? path === item.to
      : path === item.to || path.startsWith(`${item.to}/`);
    if (match && (!best || item.to.length > best.to.length)) best = item;
  }
  return best;
}
