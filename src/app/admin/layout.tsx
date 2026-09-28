import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { isAuthenticated } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              إ
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">لوحة التحكم</p>
              <p className="text-xs text-muted-foreground">نظام الشهادات</p>
            </div>
          </div>

          <div className="ms-auto flex items-center gap-2">
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                خروج
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:gap-8">
        <aside className="md:w-56 md:shrink-0">
          <AdminNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
