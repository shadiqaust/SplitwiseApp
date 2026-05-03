import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, User, LogOut, UserCheck, Shield } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/notifications-bell";
import { EmailVerificationBanner } from "@/components/email-verification-banner";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/friends", label: "Friends", icon: UserCheck },
  { href: "/profile", label: "Profile", icon: User },
] as const;

function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex items-center gap-2 font-bold text-xl text-primary",
        className,
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6"
      >
        <path d="M12 2v20" />
        <path d="M18 6l4 6-4 6" />
        <path d="M6 18l-4-6 4-6" />
      </svg>
      Splitix
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user: authUser, signOut, updateUser } = useAuth();
  const { data: me } = useGetMe();
  const [location] = useLocation();

  // Keep cached authUser.role in sync with the latest server-side profile so
  // existing sessions (cached before role was added) auto-upgrade without a
  // sign-out + sign-in.
  useEffect(() => {
    if (me && (me as { role?: string }).role && (me as { role?: string }).role !== authUser?.role) {
      updateUser({ role: (me as { role?: string }).role });
    }
  }, [me, authUser?.role, updateUser]);

  // Prefer the freshest server-side profile (useGetMe) so the header avatar
  // and name update immediately after a profile change anywhere in the app.
  const user = {
    name: me?.name ?? authUser?.name ?? "",
    email: me?.email ?? authUser?.email ?? "",
    avatarUrl: me?.avatarUrl ?? authUser?.avatarUrl ?? null,
  };

  const firstName = user.name ? user.name.split(" ")[0] : "";
  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile top header */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <Logo />
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <Link
            href="/profile"
            className="flex items-center gap-2 min-w-0"
            aria-label="Open profile"
          >
            {firstName && (
              <span className="text-sm font-medium truncate max-w-[120px]">
                {firstName}
              </span>
            )}
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                {initials}
              </div>
            )}
          </Link>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-card flex-col sticky top-0 h-screen shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <Logo />
          <NotificationsBell />
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={location === href ? "secondary" : "ghost"}
                className="w-full justify-start"
              >
                <Icon className="w-4 h-4 mr-2" />
                {label}
              </Button>
            </Link>
          ))}
          {authUser?.role === "superadmin" && (
            <Link href="/admin">
              <Button
                variant={location.startsWith("/admin") ? "secondary" : "ghost"}
                className="w-full justify-start"
              >
                <Shield className="w-4 h-4 mr-2" />
                Admin
              </Button>
            </Link>
          )}
        </nav>

        <div className="p-4 border-t shrink-0 bg-card">
          <Link
            href="/profile"
            className="flex items-center gap-3 mb-4 rounded-md p-1 -m-1 hover:bg-accent transition-colors"
            aria-label="Open profile"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.name || user.email}
              </p>
              {user.name && (
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              )}
            </div>
          </Link>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive"
            onClick={() => signOut()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <EmailVerificationBanner />
          {children}
        </div>
      </main>

      {/* Mobile bottom tab nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul
          className={cn(
            "grid",
            authUser?.role === "superadmin" ? "grid-cols-5" : "grid-cols-4",
          )}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
          {authUser?.role === "superadmin" && (
            <li>
              <Link
                href="/admin"
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  location.startsWith("/admin")
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={location.startsWith("/admin") ? "page" : undefined}
              >
                <Shield className="w-5 h-5" aria-hidden="true" />
                <span>Admin</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
