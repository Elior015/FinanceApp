"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./nav-links";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 px-2 pb-safe backdrop-blur-md md:hidden card-shadow">
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-lg transition-all",
                active ? "bg-primary/10" : "",
              )}
            >
              <Icon className="size-5" />
            </div>
            {label}
            {active && <span className="absolute top-1.5 h-1 w-1 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}
