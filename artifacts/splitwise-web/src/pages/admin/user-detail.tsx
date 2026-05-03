import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { adminApi } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { AdminLayout } from "./layout";
import { ArrowLeft, Shield, ShieldOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [roleError, setRoleError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => adminApi.getUser(userId),
    enabled: !!userId,
  });

  const setRole = useMutation({
    mutationFn: (role: "user" | "superadmin") => adminApi.setUserRole(userId, role),
    onSuccess: () => {
      setRoleError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: Error) => setRoleError(err.message),
  });

  if (isLoading || !data) {
    return (
      <AdminLayout>
        <Link href="/admin/users" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <p className="text-muted-foreground">Loading…</p>
      </AdminLayout>
    );
  }

  const { user, stats, groups, expenses, payments } = data;
  const isSelf = currentUser?.id === user.id;
  const isAdmin = user.role === "superadmin";
  const nextRole: "user" | "superadmin" = isAdmin ? "user" : "superadmin";
  const verb = isAdmin ? "Demote to user" : "Promote to superadmin";

  const onToggleRole = () => {
    const msg = isAdmin
      ? `Remove superadmin access from ${user.name}? They'll lose access to /admin.`
      : `Promote ${user.name} to superadmin? They'll gain full access to /admin.`;
    if (!window.confirm(msg)) return;
    setRole.mutate(nextRole);
  };

  return (
    <AdminLayout>
      <Link
        href="/admin/users"
        className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4 hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> All users
      </Link>

      <div className="flex items-start gap-4 mb-6">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {user.name}
            {user.role === "superadmin" && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                <Shield className="w-3 h-3" /> superadmin
              </span>
            )}
          </h1>
          <p className="text-muted-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {[user.country, user.location].filter(Boolean).join(" · ") || "—"} ·
            joined {new Date(user.createdAt).toLocaleDateString()} · default {user.defaultCurrency}
          </p>
        </div>
        <div className="ml-auto">
          <Button
            variant={isAdmin ? "outline" : "default"}
            size="sm"
            onClick={onToggleRole}
            disabled={setRole.isPending || isSelf}
            title={isSelf ? "You can't change your own role" : verb}
          >
            {setRole.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : isAdmin ? (
              <ShieldOff className="w-4 h-4 mr-1" />
            ) : (
              <Shield className="w-4 h-4 mr-1" />
            )}
            {verb}
          </Button>
          {isSelf && (
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              Can't change your own role
            </p>
          )}
        </div>
      </div>
      {roleError && (
        <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
          {roleError}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <Stat label="Groups" value={stats.groupCount} />
        <Stat label="Expenses paid" value={stats.paidCount} />
        <Stat label="Total paid" value={stats.paidTotal} />
        <Stat label="Payments sent" value={stats.paymentsSent} />
        <Stat label="Payments received" value={stats.paymentsReceived} />
      </div>

      <Section title={`Groups (${groups.length})`}>
        {groups.length === 0 ? (
          <Empty>No groups.</Empty>
        ) : (
          <ul className="divide-y">
            {groups.map((g) => (
              <li key={g.id} className="py-2 flex items-center justify-between text-sm">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground">
                  {g.currency} · joined {new Date(g.joinedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Recent expenses (${expenses.length})`}>
        {expenses.length === 0 ? (
          <Empty>No expenses paid.</Empty>
        ) : (
          <ul className="divide-y">
            {expenses.map((e) => (
              <li key={e.id} className="py-2 flex items-center justify-between text-sm">
                <span className="truncate pr-3">{e.description}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {e.currency} {e.totalAmount} · {e.date}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Recent payments (${payments.length})`}>
        {payments.length === 0 ? (
          <Empty>No payments.</Empty>
        ) : (
          <ul className="divide-y">
            {payments.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                <span>
                  {p.fromUserId === user.id ? "Sent" : "Received"} {p.amount}
                </span>
                <span className="text-muted-foreground">{p.date}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AdminLayout>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 border rounded-lg p-4 bg-card">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
