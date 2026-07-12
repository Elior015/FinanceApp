import { LayoutDashboard, Lightbulb, PiggyBank, Receipt, RefreshCw, Wallet } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/net-worth", label: "Net Worth", icon: PiggyBank },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/sync", label: "Sync Health", icon: RefreshCw },
];
