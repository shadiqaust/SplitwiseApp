import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Link } from "wouter";
import { adminApi } from "@/lib/admin-api";
import { AdminLayout } from "./layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Shield, ChevronLeft, ChevronRight, Mail } from "lucide-react";

const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the search query changes — otherwise a search
  // that returns fewer pages would leave the user stuck on an empty page.
  useEffect(() => {
    setPage(1);
  }, [q]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "users", q, page],
    queryFn: () => adminApi.listUsers({ q: q || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp the displayed page to totalPages so the range counter stays sane
  // if the total shrinks asynchronously (e.g. another admin deletes users).
  const displayPage = Math.min(page, totalPages);
  const rangeFrom = total === 0 ? 0 : (displayPage - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(displayPage * PAGE_SIZE, total);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1">Users</h1>
      <p className="text-muted-foreground mb-6">All registered users on Splitix, sorted by name.</p>

      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium hidden md:table-cell">Email</th>
              <th className="p-3 font-medium">Currency</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium hidden lg:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && (data?.users.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
            {data?.users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/30">
                <td className="p-3">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    {u.avatarUrl ? (
                      <img
                        src={u.avatarUrl}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs">
                        {u.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <span className="truncate max-w-[12rem]">{u.name}</span>
                  </Link>
                  {/* Show email under the name on small screens where the dedicated column is hidden */}
                  <div className="md:hidden mt-1 ml-9 text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {u.email}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">
                  <a
                    href={`mailto:${u.email}`}
                    className="hover:text-foreground hover:underline break-all"
                  >
                    {u.email}
                  </a>
                </td>
                <td className="p-3">{u.defaultCurrency}</td>
                <td className="p-3">
                  {u.role === "superadmin" ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      <Shield className="w-3 h-3" /> superadmin
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">user</span>
                  )}
                </td>
                <td className="p-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
        <div>
          {total === 0
            ? "No results"
            : `Showing ${rangeFrom}–${rangeTo} of ${total}`}
          {isFetching && !isLoading && <span className="ml-2 italic">Updating…</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </Button>
          <span className="tabular-nums">
            Page {displayPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
          >
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
