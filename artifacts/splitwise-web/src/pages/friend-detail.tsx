import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ChevronLeft, HandCoins, Search, X } from "lucide-react";
import {
  type ExpenseWithSplits,
  type Payment,
  type User,
  useGetMe,
} from "@workspace/api-client-react";

import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SettleUpWithFriendDialog } from "@/components/settle-up-with-friend-dialog";
import { cn, formatCurrency } from "@/lib/format";

interface FriendActivityResponse {
  friend: User;
  netBalance: number;
  expenses: ExpenseWithSplits[];
  payments: Payment[];
}

type Item =
  | { kind: "expense"; date: string; data: ExpenseWithSplits }
  | { kind: "payment"; date: string; data: Payment };

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function FriendAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-14 h-14 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-base flex-shrink-0">
      {initials}
    </div>
  );
}

export function FriendDetailPage() {
  const params = useParams<{ friendId: string }>();
  const friendId = params.friendId;
  const me = useGetMe();
  const myId = me.data?.id;
  const [search, setSearch] = useState("");
  const [settleOpen, setSettleOpen] = useState(false);

  const { data, isLoading } = useQuery<FriendActivityResponse>({
    queryKey: ["friend-activity", friendId],
    queryFn: async () => {
      const res = await fetch(`/api/friends/${friendId}/activity`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    enabled: typeof friendId === "string" && friendId.length > 0,
  });

  const allItems = useMemo<Item[]>(() => {
    if (!data) return [];
    const items: Item[] = [
      ...data.expenses.map((e) => ({ kind: "expense" as const, date: e.date, data: e })),
      ...data.payments.map((p) => ({ kind: "payment" as const, date: p.date, data: p })),
    ];
    items.sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d !== 0) return d;
      const aCa = String((a.data as { createdAt?: string }).createdAt ?? "");
      const bCa = String((b.data as { createdAt?: string }).createdAt ?? "");
      return bCa.localeCompare(aCa);
    });
    return items;
  }, [data]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) => {
      const dateStr = it.date.toLowerCase();
      const monthLabel = MONTH_FMT.format(new Date(it.date)).toLowerCase();
      if (dateStr.includes(q) || monthLabel.includes(q)) return true;
      if (it.kind === "expense") {
        const e = it.data;
        return (
          e.description.toLowerCase().includes(q) ||
          (e.paidByUser?.name ?? "").toLowerCase().includes(q)
        );
      }
      const p = it.data;
      return (
        (p.note ?? "").toLowerCase().includes(q) ||
        (p.fromUser?.name ?? "").toLowerCase().includes(q) ||
        (p.toUser?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [allItems, search]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, Item[]>();
    const labels = new Map<string, string>();
    for (const it of filteredItems) {
      const d = new Date(it.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = MONTH_FMT.format(d);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(it);
      labels.set(key, label);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: labels.get(key) ?? key, items }));
  }, [filteredItems]);

  const friend = data?.friend;
  const net = data?.netBalance ?? 0;

  return (
    <Layout>
      <div className="space-y-6 pb-24">
        <div className="flex items-center gap-3">
          <Link href="/friends">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Friends
            </Button>
          </Link>
          {friend && myId && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setSettleOpen(true)}
            >
              <HandCoins className="w-4 h-4 mr-1.5" /> Settle up
            </Button>
          )}
        </div>

        {friend && myId && (
          <SettleUpWithFriendDialog
            friend={{ id: friend.id, name: friend.name }}
            currentUserId={myId}
            netBalance={net}
            open={settleOpen}
            onOpenChange={setSettleOpen}
          />
        )}

        {isLoading && !data ? (
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        ) : friend ? (
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <FriendAvatar name={friend.name} avatarUrl={friend.avatarUrl ?? null} />
              <div className="flex-1 min-w-0">
                <p className="text-xl font-bold truncate">{friend.name}</p>
                <p className="text-sm text-muted-foreground truncate">{friend.email}</p>
              </div>
              <div className="text-right">
                {Math.abs(net) < 0.01 ? (
                  <p className="text-sm text-muted-foreground">settled up</p>
                ) : (
                  <>
                    <p
                      className={cn(
                        "text-2xl font-bold",
                        net > 0 ? "text-green-600" : "text-red-500",
                      )}
                    >
                      {formatCurrency(Math.abs(net))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {net > 0 ? "owes you" : "you owe"}
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && allItems.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 pr-9"
              placeholder="Search by title, note, or date (e.g. May, 2026-05)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {!isLoading && allItems.length === 0 ? (
          <div className="text-center py-12 px-4 border rounded-xl bg-card">
            <p className="text-lg font-semibold mb-1">No activity yet</p>
            <p className="text-sm text-muted-foreground">
              Add an expense or record a payment with{" "}
              {friend?.name ?? "this friend"} to get started.
            </p>
          </div>
        ) : !isLoading && grouped.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No activity matches "{search}".
          </p>
        ) : (
          grouped.map((bucket) => (
            <div key={bucket.key} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {bucket.label}
              </p>
              <div className="space-y-2">
                {bucket.items.map((item) =>
                  item.kind === "expense" ? (
                    <ExpenseRow
                      key={`e-${item.data.id}`}
                      expense={item.data}
                      myId={myId}
                      friendId={String(friendId)}
                    />
                  ) : (
                    <PaymentRow
                      key={`p-${item.data.id}`}
                      payment={item.data}
                      myId={myId}
                    />
                  ),
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}

function ExpenseRow({
  expense,
  myId,
  friendId,
}: {
  expense: ExpenseWithSplits;
  myId: string | undefined;
  friendId: string;
}) {
  const total = Number(expense.totalAmount);
  const iPaid = myId && expense.paidByUserId === myId;
  const friendPaid = expense.paidByUserId === friendId;
  const mySplit = myId ? expense.splits.find((s) => s.userId === myId) : undefined;
  const friendSplit = expense.splits.find((s) => s.userId === friendId);

  let impact = 0;
  let label = "";
  if (iPaid && friendSplit) {
    impact = Number(friendSplit.amount);
    label = "you lent";
  } else if (friendPaid && mySplit) {
    impact = -Number(mySplit.amount);
    label = "you owe";
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{expense.description}</p>
          <p className="text-sm text-muted-foreground truncate">
            {iPaid
              ? `You paid ${formatCurrency(total)}`
              : `${expense.paidByUser?.name ?? "Someone"} paid ${formatCurrency(total)}`}
            {expense.groupId ? " · group expense" : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{expense.date}</p>
        </div>
        <div className="text-right">
          {impact !== 0 ? (
            <>
              <p
                className={cn(
                  "font-semibold",
                  impact > 0 ? "text-green-600" : "text-red-500",
                )}
              >
                {impact > 0 ? "+" : "-"}
                {formatCurrency(Math.abs(impact))}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">not split</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentRow({
  payment,
  myId,
}: {
  payment: Payment;
  myId: string | undefined;
}) {
  const amount = Number(payment.amount);
  const iPaid = myId && payment.fromUserId === myId;
  const impact = iPaid ? amount : -amount;

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">
            {iPaid
              ? `You paid ${payment.toUser?.name ?? "friend"}`
              : `${payment.fromUser?.name ?? "Friend"} paid you`}
          </p>
          {payment.note && (
            <p className="text-sm text-muted-foreground truncate">{payment.note}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{payment.date}</p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "font-semibold",
              impact > 0 ? "text-green-600" : "text-red-500",
            )}
          >
            {impact > 0 ? "+" : "-"}
            {formatCurrency(Math.abs(impact))}
          </p>
          <p className="text-xs text-muted-foreground">
            {iPaid ? "you settled" : "they settled"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
