import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  FileText,
  HandCoins,
  Plus,
  Users,
} from "lucide-react";
import {
  type ExpenseWithSplits,
  type Payment,
  type User,
  useGetMe,
  useListGroups,
} from "@workspace/api-client-react";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettleUpWithFriendDialog } from "@/components/settle-up-with-friend-dialog";
import { cn, formatCurrency } from "@/lib/format";
import { resolveAvatarUrl } from "@/lib/avatar-presets";

interface FriendActivityResponse {
  friend: User;
  netBalance: number;
  balances: { currency: string; amount: number }[];
  expenses: ExpenseWithSplits[];
  payments: (Payment & { currency?: string })[];
}

type Bucket = { key: string; label: string; amount: number };

type ActivityRow = {
  key: string;
  date: Date;
  createdAt: Date;
  monthKey: string;
  monthLabel: string;
  dayMonth: string;
  dayNum: string;
  icon: "file-text" | "users" | "credit-card";
  /** When present, render this avatar in place of the icon (used for group rows). */
  iconAvatarUrl?: string | null;
  iconFallbackName?: string;
  title: string;
  subtitle: string;
  kind: "expense" | "payment";
  delta: number;
  currency?: string;
  /** Where clicking the row navigates. null = not clickable. */
  href: string | null;
};

const monthShort = new Intl.DateTimeFormat("en-US", { month: "short" });
const monthLong = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return full;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]?.toUpperCase() ?? ""}.`;
}

// Parse date strings without TZ shifts. `YYYY-MM-DD` strings are treated as
// local calendar dates so the day/month displayed matches what the user
// picked, regardless of their timezone.
function parseLocalDate(raw: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(raw);
}

function expenseDate(e: ExpenseWithSplits): Date {
  const raw = (e as unknown as { date?: string }).date ?? e.createdAt;
  return parseLocalDate(raw);
}

function paymentDate(p: Payment): Date {
  const raw = (p as unknown as { date?: string }).date ?? p.createdAt;
  return parseLocalDate(raw);
}

function HeroAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const resolved = avatarUrl ? (resolveAvatarUrl(avatarUrl) ?? avatarUrl) : null;
  return (
    <div className="w-24 h-24 rounded-full bg-background p-1.5 shadow-md ring-1 ring-border">
      {resolved ? (
        <img
          src={resolved}
          alt={name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-semibold">
          {initials}
        </div>
      )}
    </div>
  );
}

export function FriendDetailPage() {
  const params = useParams<{ friendId: string }>();
  const friendId = params.friendId;
  const me = useGetMe();
  const myId = me.data?.id;
  const { data: groupsList } = useListGroups();
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groupsList ?? []) m.set(g.id, g.name);
    return m;
  }, [groupsList]);
  const groupAvatarById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const g of groupsList ?? []) m.set(g.id, g.avatarUrl ?? null);
    return m;
  }, [groupsList]);
  const [settleOpen, setSettleOpen] = useState(false);

  const { data, isLoading } = useQuery<FriendActivityResponse>({
    queryKey: ["friend-activity", friendId],
    queryFn: async () => {
      const res = await fetch(`/api/friends/${friendId}/activity`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    enabled: typeof friendId === "string" && friendId.length > 0,
  });

  const buckets = useMemo<Bucket[]>(() => {
    if (!data || !myId) return [];
    const m = new Map<string, number>();
    const bump = (k: string, d: number) => m.set(k, (m.get(k) ?? 0) + d);
    for (const e of data.expenses) {
      const k = e.groupId ?? "__none__";
      if (e.paidByUserId === myId) {
        const fs = e.splits.find((s) => s.userId === friendId);
        if (fs) bump(k, parseFloat(String(fs.amount)));
      } else if (e.paidByUserId === friendId) {
        const ms = e.splits.find((s) => s.userId === myId);
        if (ms) bump(k, -parseFloat(String(ms.amount)));
      }
    }
    for (const p of data.payments) {
      const k = p.groupId ?? "__none__";
      const amt = parseFloat(String(p.amount));
      if (p.fromUserId === myId) bump(k, amt);
      else bump(k, -amt);
    }
    const out: Bucket[] = [];
    for (const [k, amount] of m) {
      if (Math.abs(amount) < 0.01) continue;
      out.push({
        key: k,
        label:
          k === "__none__"
            ? "non-group expenses"
            : `“${groupNameById.get(k) ?? "Group"}”`,
        amount,
      });
    }
    out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return out;
  }, [data, myId, friendId, groupNameById]);

  const activity = useMemo<ActivityRow[]>(() => {
    if (!data || !myId) return [];
    const friendShort = shortName(data.friend.name);
    const rows: ActivityRow[] = [];
    // Aggregate expenses by group: all expenses in the same group collapse
    // to a single row showing the friend's net balance impact across them.
    const groupAgg = new Map<
      string,
      { count: number; delta: number; latest: Date }
    >();

    for (const e of data.expenses) {
      let delta = 0;
      let subtitle = "";
      if (e.paidByUserId === myId) {
        const fs = e.splits.find((s) => s.userId === friendId);
        delta = fs ? parseFloat(String(fs.amount)) : 0;
        subtitle = `You paid ${formatCurrency(parseFloat(String(e.totalAmount)), e.currency)}`;
      } else if (e.paidByUserId === friendId) {
        const ms = e.splits.find((s) => s.userId === myId);
        delta = ms ? -parseFloat(String(ms.amount)) : 0;
        subtitle = `${friendShort} paid ${formatCurrency(parseFloat(String(e.totalAmount)), e.currency)}`;
      }
      const d = expenseDate(e);
      if (e.groupId) {
        const cur = groupAgg.get(e.groupId);
        if (cur) {
          cur.count += 1;
          cur.delta += delta;
          if (d.getTime() > cur.latest.getTime()) cur.latest = d;
        } else {
          groupAgg.set(e.groupId, { count: 1, delta, latest: d });
        }
        continue;
      }
      rows.push({
        key: `e:${e.id}`,
        date: d,
        createdAt: new Date(e.createdAt as unknown as string),
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        monthLabel: monthLong.format(d),
        dayMonth: monthShort.format(d),
        dayNum: String(d.getDate()),
        icon: "file-text",
        title: e.description,
        subtitle,
        kind: "expense",
        delta,
        currency: e.currency,
        href: `/expenses/${e.id}?from=${encodeURIComponent(`/friends/${friendId}`)}`,
      });
    }

    for (const [gid, agg] of groupAgg.entries()) {
      const gname = groupNameById.get(gid) ?? "Group";
      const d = agg.latest;
      rows.push({
        key: `g:${gid}`,
        date: d,
        createdAt: d,
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        monthLabel: monthLong.format(d),
        dayMonth: monthShort.format(d),
        dayNum: String(d.getDate()),
        icon: "users",
        iconAvatarUrl: groupAvatarById.get(gid) ?? null,
        iconFallbackName: gname,
        title: gname,
        subtitle: `${agg.count} shared ${agg.count === 1 ? "expense" : "expenses"} · Shared group`,
        kind: "expense",
        delta: agg.delta,
        href: `/groups/${gid}`,
      });
    }
    for (const p of data.payments) {
      const amt = parseFloat(String(p.amount));
      let delta = 0;
      let title = "Payment";
      if (p.fromUserId === myId) {
        delta = amt;
        title = `You paid ${friendShort} ${formatCurrency(amt, p.currency)}`;
      } else {
        delta = -amt;
        title = `${friendShort} paid you ${formatCurrency(amt, p.currency)}`;
      }
      const d = paymentDate(p);
      rows.push({
        key: `p:${p.id}`,
        date: d,
        createdAt: new Date(p.createdAt as unknown as string),
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        monthLabel: monthLong.format(d),
        dayMonth: monthShort.format(d),
        dayNum: String(d.getDate()),
        icon: "credit-card",
        title,
        subtitle: p.groupId
          ? `Settle-up · ${groupNameById.get(p.groupId) ?? "group"}`
          : "Settle-up payment",
        kind: "payment",
        delta,
        currency: p.currency,
        href: p.groupId ? `/groups/${p.groupId}` : null,
      });
    }
    rows.sort((a, b) => {
      const byDate = b.date.getTime() - a.date.getTime();
      if (byDate !== 0) return byDate;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return rows;
  }, [data, myId, friendId, groupAvatarById, groupNameById]);

  const friend = data?.friend;
  const friendShort = friend ? shortName(friend.name) : "";
  const nonZeroBalances = (data?.balances ?? []).filter((b) => Math.abs(b.amount) >= 0.01);

  return (
    <Layout>
      <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 pb-16">
        {/* Decorative banner */}
        <div className="relative h-36 bg-primary overflow-hidden isolate">
          <div className="absolute -top-24 -right-12 w-56 h-56 rotate-45 bg-white/10" />
          <div className="absolute -bottom-16 -left-10 w-44 h-44 rotate-12 bg-white/5" />
          <div className="absolute -bottom-12 right-12 w-32 h-32 rotate-6 bg-white/10" />
          <div className="relative z-10 flex items-center justify-between px-4 pt-4">
            <Link href="/friends">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back to friends"
                className="rounded-full bg-background/95 hover:bg-background h-9 w-9 text-foreground"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Avatar overlapping the banner */}
        <div className="relative z-10 px-5 -mt-12">
          {isLoading && !data ? (
            <Skeleton className="w-24 h-24 rounded-full" />
          ) : friend ? (
            <HeroAvatar name={friend.name} avatarUrl={friend.avatarUrl ?? null} />
          ) : null}
        </div>

        {/* Header content */}
        <div className="px-5 pt-3 space-y-2">
          {isLoading && !data ? (
            <>
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </>
          ) : friend ? (
            <>
              <h1 className="text-2xl font-bold truncate">{friend.name}</h1>
              {nonZeroBalances.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  you are all settled up
                </p>
              ) : (
                <div className="space-y-0.5 pt-1">
                  {nonZeroBalances.map((b) => {
                    const friendOwes = b.amount > 0;
                    return (
                      <p
                        key={b.currency}
                        className={cn(
                          "text-base font-medium",
                          friendOwes ? "text-green-600" : "text-red-500",
                        )}
                      >
                        {friendOwes ? "You are owed" : "You owe"}{" "}
                        <span className="font-bold">
                          {formatCurrency(Math.abs(b.amount), b.currency)}
                        </span>
                      </p>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Action chip row */}
        {friend && myId && (
          <div className="px-5 pt-5 pb-2 flex gap-2 overflow-x-auto">
            <Button
              onClick={() => setSettleOpen(true)}
              className="rounded-full h-9 px-4 gap-1.5 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              Settle up
            </Button>
            <Link href={`/expenses/new?friendId=${friend.id}`}>
              <Button
                variant="outline"
                className="rounded-full h-9 px-4 gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add expense
              </Button>
            </Link>
          </div>
        )}

        {friend && myId && (
          <SettleUpWithFriendDialog
            friend={{ id: friend.id, name: friend.name }}
            currentUserId={myId}
            netBalance={data?.netBalance ?? 0}
            balances={data?.balances}
            open={settleOpen}
            onOpenChange={setSettleOpen}
          />
        )}

        {/* Activity timeline */}
        <div className="px-5 pt-3">
          {!isLoading && activity.length === 0 ? (
            <div className="text-center py-12 px-4 border rounded-xl bg-card mt-4">
              <p className="text-lg font-semibold mb-1">No activity yet</p>
              <p className="text-sm text-muted-foreground">
                Add an expense or record a payment with{" "}
                {friend?.name ?? "this friend"} to get started.
              </p>
            </div>
          ) : (
            <Timeline rows={activity} />
          )}
        </div>
      </div>
    </Layout>
  );
}

function Timeline({ rows }: { rows: ActivityRow[] }) {
  const out: React.ReactNode[] = [];
  let lastMonth: string | null = null;
  for (const row of rows) {
    if (row.monthKey !== lastMonth) {
      out.push(
        <h2
          key={`m:${row.monthKey}`}
          className="text-sm font-bold mt-5 mb-2 text-foreground"
        >
          {row.monthLabel}
        </h2>,
      );
      lastMonth = row.monthKey;
    }
    out.push(<TimelineRow key={row.key} row={row} />);
  }
  return <div>{out}</div>;
}

function TimelineRow({ row }: { row: ActivityRow }) {
  const settled = Math.abs(row.delta) < 0.01;
  const positive = row.delta > 0;
  // Payments are settle-up activity even though they shift the balance;
  // we show "settled up" rather than lent/borrowed.
  const isPayment = row.kind === "payment";
  const tone = settled || isPayment
    ? "text-muted-foreground"
    : positive
      ? "text-green-600"
      : "text-red-500";
  const label = isPayment
    ? "paid"
    : settled
      ? "settled up"
      : positive
        ? "you lent"
        : "you borrowed";
  const Icon = row.icon === "users" ? Users : row.icon === "credit-card" ? CreditCard : FileText;
  const iconTint = row.icon === "users" ? "text-primary" : "text-muted-foreground";
  const resolvedAvatar = row.iconAvatarUrl
    ? (resolveAvatarUrl(row.iconAvatarUrl) ?? row.iconAvatarUrl)
    : null;
  const avatarInitials = (row.iconFallbackName ?? row.title)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const inner = (
    <>
      <div className="w-9 flex flex-col items-center shrink-0">
        <span className="text-[10px] font-medium uppercase text-muted-foreground leading-tight">
          {row.dayMonth}
        </span>
        <span className="text-base font-bold leading-tight">{row.dayNum}</span>
      </div>
      {resolvedAvatar ? (
        <img
          src={resolvedAvatar}
          alt={row.iconFallbackName ?? row.title}
          className="w-10 h-10 rounded-md object-cover border shrink-0"
        />
      ) : row.iconAvatarUrl === null && row.icon === "users" ? (
        <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary text-xs font-semibold">
          {avatarInitials}
        </div>
      ) : isPayment ? (
        <div className="w-10 h-10 rounded-md bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center shrink-0">
          <HandCoins className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-md bg-muted border flex items-center justify-center shrink-0">
          <Icon className={cn("w-4 h-4", iconTint)} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{row.title}</p>
        <p className="text-xs text-muted-foreground truncate">{row.subtitle}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-[10px] font-medium", tone)}>{label}</p>
        {!settled && (
          <p className={cn("font-bold text-sm", tone)}>
            {formatCurrency(Math.abs(row.delta), row.currency)}
          </p>
        )}
      </div>
    </>
  );
  if (row.href) {
    return (
      <Link
        href={row.href}
        className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-md hover:bg-accent/40 transition-colors cursor-pointer"
      >
        {inner}
      </Link>
    );
  }
  return <div className="flex items-center gap-3 py-2.5">{inner}</div>;
}
