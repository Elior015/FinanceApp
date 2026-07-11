import { LayoutDashboard, Receipt, RefreshCw, Wallet } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/sync", label: "Sync Health", icon: RefreshCw },
];
