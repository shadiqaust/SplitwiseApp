import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { adminApi } from "@/lib/admin-api";
import { AdminLayout } from "./layout";
import { Input } from "@/components/ui/input";
import { Search, Shield } from "lucide-react";

export function AdminUsersPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () => adminApi.listUsers(q || undefined),
  });

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1">Users</h1>
      <p className="text-muted-foreground mb-6">All registered users on Splitix.</p>

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
                    {u.name}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">
                  {u.email}
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
                <td className="p-3 text-muted-foreground hidden lg:table-cell">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
