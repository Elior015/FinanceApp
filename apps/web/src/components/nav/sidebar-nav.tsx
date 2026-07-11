"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./nav-links";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex md:w-56 md:flex-col md:gap-1 md:border-r md:p-4">
      <span className="mb-4 px-2 text-sm font-semibold text-muted-foreground">Household Finance</span>
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
              active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/50",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
