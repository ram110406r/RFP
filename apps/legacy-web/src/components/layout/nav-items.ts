import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FileStack,
  LayoutDashboard,
  Send,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface NavGroup {
  /** Rendered as a section label when expanded; becomes a divider when collapsed. */
  label: string | null;
  items: NavItem[];
}

/**
 * Grouped by what the user is doing, not by alphabetical or arbitrary order:
 *
 *   (ungrouped)  Dashboard — the entry point, deliberately outside any group
 *   Pipeline     the RFP lifecycle, in the order work moves through it
 *   Insight      things you read rather than act on
 *   (footer)     Settings, pinned to the bottom
 *
 * The flat seven-item list gave equal weight to Dashboard and Settings, which
 * are used at completely different frequencies.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ label: "Dashboard", to: "/", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Pipeline",
    items: [
      { label: "RFPs", to: "/rfps", icon: FileStack },
      { label: "Reviews", to: "/reviews", icon: ClipboardCheck },
      { label: "Submissions", to: "/submissions", icon: Send },
    ],
  },
  {
    label: "Insight",
    items: [
      { label: "Knowledge", to: "/knowledge", icon: BookOpen },
      { label: "Analytics", to: "/analytics", icon: BarChart3 },
    ],
  },
];

export const NAV_FOOTER_ITEMS: NavItem[] = [{ label: "Settings", to: "/settings", icon: Settings }];

/** Flat list, for the command palette and anything else that needs every route. */
export const NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_FOOTER_ITEMS];
