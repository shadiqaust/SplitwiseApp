import { Link, useLocation, Redirect } from "wouter";
import { Shield, Users, Coins, Bell, ArrowLeft, Home, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: Shield, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/currencies", label: "Currencies", icon: Coins },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
] as const;

const APP_LINKS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useAuth();
  const [location] = useLocation();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (user?.role !== "superadmin") return <Redirect to="/dashboard" />;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="md:w-64 md:border-r md:sticky md:top-0 md:h-screen bg-card flex flex-col shrink-0">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-bold">Admin</span>
          </div>
          {/* Always-visible exit on mobile (sidebar header is the top bar there). */}
          <Link
            href="/dashboard"
            className="md:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Back to app"
          >
            <ArrowLeft className="w-4 h-4" /> Exit
          </Link>
        </div>
        <nav className="p-2 flex md:flex-col gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? location === item.href
              : location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
          {/* Mobile-only: jump to Home/Profile from inside the admin nav. */}
          <div className="md:hidden flex gap-1 ml-2 pl-2 border-l">
            {APP_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-muted"
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="mt-auto p-2 hidden md:flex md:flex-col gap-1 border-t">
          {APP_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
              >
                <Icon className="w-4 h-4" /> {item.label}
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" /> Back to app
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl">{children}</main>
    </div>
  );
}
