import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/bottom-nav";
import { SidebarNav } from "@/components/nav/sidebar-nav";
import { signOut } from "../actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <SidebarNav />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm text-muted-foreground">Signed in as {user?.email}</span>
          <form action={signOut}>
            <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
