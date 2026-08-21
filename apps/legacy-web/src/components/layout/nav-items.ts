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

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, exact: true },
  { label: "RFPs", to: "/rfps", icon: FileStack },
  { label: "Knowledge", to: "/knowledge", icon: BookOpen },
  { label: "Reviews", to: "/reviews", icon: ClipboardCheck },
  { label: "Submissions", to: "/submissions", icon: Send },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Settings", to: "/settings", icon: Settings },
];
