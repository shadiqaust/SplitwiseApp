import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Gift, Search } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { Input } from "@/components/ui/input";
import { AdminLayout } from "./layout";
import { resolveAvatarUrl } from "@/lib/avatar-presets";

function Avatar({ name, url }: { name: string; url: string | null }) {
  const resolved = url ? (resolveAvatarUrl(url) ?? url) : null;
  if (resolved) {
    return <img src={resolved} alt="" className="w-7 h-7 rounded-full object-cover" />;
  }
  return (
    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs">
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export function AdminReferralsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  // Debounce the search input by 250ms so we don't slam the server on every
  // keystroke. Trim before sending so trailing spaces don't refire queries.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "referrals", debounced],
    queryFn: () => adminApi.listReferrals(debounced || undefined),
  });

  const referrals = data?.referrals ?? [];
  const top = data?.topReferrers ?? [];

  return (
    <AdminLayout>
      <div className="flex items-center gap-2 mb-1">
        <Gift className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-bold">Referrals</h1>
      </div>
      <p className="text-muted-foreground mb-4">
        Users who signed up via someone else's invite link
        (<code className="text-xs bg-muted px-1 py-0.5 rounded">?ref=&lt;userId&gt;</code>).
      </p>

      <div className="relative mb-6 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user or referrer name/email…"
          className="pl-9"
        />
      </div>

      {/* Top referrers leaderboard — reflects the current search filter so
          admins can see who has invited the matching users. */}
      {top.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Top referrers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {top.map((r) => (
              <Link
                key={r.id}
                href={`/admin/users/${r.id}`}
                className="flex items-center gap-3 border rounded-lg p-3 bg-card hover:bg-muted/40"
              >
                <Avatar name={r.name} url={r.avatarUrl} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                </div>
                <span className="text-xs font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                  {r.count} {r.count === 1 ? "invite" : "invites"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="p-3 font-medium">New user</th>
              <th className="p-3 font-medium hidden md:table-cell">Email</th>
              <th className="p-3 font-medium">Referred by</th>
              <th className="p-3 font-medium hidden lg:table-cell">Signed up</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && referrals.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  {debounced
                    ? `No referrals match "${debounced}".`
                    : "No referral signups yet. Share your invite link to get started."}
                </td>
              </tr>
            )}
            {referrals.map((r) => (
              <tr key={r.user.id} className="border-t hover:bg-muted/30">
                <td className="p-3">
                  <Link
                    href={`/admin/users/${r.user.id}`}
                    className="flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <Avatar name={r.user.name} url={r.user.avatarUrl} />
                    {r.user.name}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">
                  {r.user.email}
                </td>
                <td className="p-3">
                  <Link
                    href={`/admin/users/${r.referrer.id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Avatar name={r.referrer.name} url={r.referrer.avatarUrl} />
                    <span className="truncate">{r.referrer.name}</span>
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground hidden lg:table-cell">
                  {new Date(r.user.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
