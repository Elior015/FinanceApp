"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./nav-links";
import { Wallet } from "lucide-react";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex md:w-64 md:flex-col md:gap-1 md:border-r md:bg-card md:p-5">
      <Link href="/" className="mb-6 flex items-center gap-3 px-2">
        <div className="flex size-9 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-md">
          <Wallet className="size-5" />
        </div>
        <span className="text-base font-bold tracking-tight">Household Finance</span>
      </Link>

      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-lg transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted group-hover:bg-background",
              )}
            >
              <Icon className="size-4" />
            </div>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
