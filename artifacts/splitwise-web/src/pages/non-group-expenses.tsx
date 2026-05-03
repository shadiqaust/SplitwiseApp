import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ChevronLeft, DollarSign, HandCoins, Receipt, Users } from "lucide-react";
import {
  type ExpenseWithSplits,
  type Payment,
  useGetMe,
} from "@workspace/api-client-react";

import { Layout } from "@/components/layout";
import { AddExpenseCTA } from "@/components/add-expense-cta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentDetailDialog } from "@/components/payment-detail-dialog";
import {
  SettleUpWithFriendDialog,
  type SettleFriend,
} from "@/components/settle-up-with-friend-dialog";
import { getCategoryIcon } from "@/lib/expense-categories";
import { cn, formatCurrency, formatDate } from "@/lib/format";
import { resolveAvatarUrl } from "@/lib/avatar-presets";

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

interface NonGroupResponse {
  myNetBalance: number;
  count: number;
  expenses: ExpenseWithSplits[];
  payments?: Payment[];
  /** Per-friend net for non-group activity only (positive = friend owes me). */
  friendNets?: Record<string, number>;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

interface FriendRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  net: number;
}

type FilterPeriod = "all" | "7d" | "30d";

export function NonGroupExpensesPage() {
  const me = useGetMe();
  const myId = me.data?.id;
  const defaultCurrency = me.data?.defaultCurrency ?? "USD";
  const [settleTarget, setSettleTarget] = useState<{
    friend: SettleFriend;
    impact: number;
  } | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [filterFriendId, setFilterFriendId] = useState<string | "all">("all");
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");

  const { data, isLoading } = useQuery<NonGroupResponse>({
    queryKey: ["non-group-expenses"],
    queryFn: async () => {
      const res = await fetch("/api/expenses/non-group", {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load non-group expenses");
      return res.json();
    },
  });

  const expenses = data?.expenses ?? [];
  const payments = data?.payments ?? [];
  const net = data?.myNetBalance ?? 0;
  const friendNets = data?.friendNets ?? {};

  // Build friends list from anyone who appears alongside me on a non-group
  // expense or payment.
  const friends = useMemo<FriendRow[]>(() => {
    if (!myId) return [];
    const userById = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const e of expenses) {
      if (e.paidByUserId !== myId && e.paidByUser) {
        userById.set(e.paidByUserId, {
          name: e.paidByUser.name,
          avatarUrl: e.paidByUser.avatarUrl ?? null,
        });
      }
      for (const s of e.splits) {
        if (s.userId !== myId && s.user) {
          userById.set(s.userId, {
            name: s.user.name,
            avatarUrl: s.user.avatarUrl ?? null,
          });
        }
      }
    }
    for (const p of payments) {
      if (p.fromUserId !== myId && p.fromUser) {
        userById.set(p.fromUserId, {
          name: p.fromUser.name,
          avatarUrl: p.fromUser.avatarUrl ?? null,
        });
      }
      if (p.toUserId !== myId && p.toUser) {
        userById.set(p.toUserId, {
          name: p.toUser.name,
          avatarUrl: p.toUser.avatarUrl ?? null,
        });
      }
    }
    const rows: FriendRow[] = [];
    for (const [id, u] of userById) {
      rows.push({ id, name: u.name, avatarUrl: u.avatarUrl, net: friendNets[id] ?? 0 });
    }
    rows.sort((a, b) => {
      const da = Math.abs(a.net), db = Math.abs(b.net);
      if (da > 0.005 && db < 0.005) return -1;
      if (db > 0.005 && da < 0.005) return 1;
      if (Math.abs(da - db) > 0.005) return db - da;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [expenses, payments, friendNets, myId]);

  // Combined activity (expenses + payments).
  const combined = useMemo(() => {
    const e = expenses.map((x) => ({
      kind: "expense" as const,
      id: `e-${x.id}`,
      data: x,
      date: x.date,
      createdAt: x.createdAt,
    }));
    const p = payments.map((x) => ({
      kind: "payment" as const,
      id: `p-${x.id}`,
      data: x,
      date: x.date,
      createdAt: x.createdAt,
    }));
    return [...e, ...p].sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d !== 0) return d;
      return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
    });
  }, [expenses, payments]);

  const filteredCombined = useMemo(() => {
    let items = combined;
    if (filterPeriod !== "all") {
      const days = filterPeriod === "7d" ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      items = items.filter((item) => {
        const d = new Date(String(item.date));
        return d >= cutoff;
      });
    }
    if (filterFriendId !== "all") {
      items = items.filter((item) => {
        if (item.kind === "expense") {
          // Expense involves the friend if they paid OR they appear in splits.
          if (item.data.paidByUserId === filterFriendId) return true;
          return item.data.splits.some((s) => s.userId === filterFriendId);
        }
        return (
          item.data.fromUserId === filterFriendId ||
          item.data.toUserId === filterFriendId
        );
      });
    }
    return items;
  }, [combined, filterFriendId, filterPeriod]);

  const groupedActivity = useMemo(() => {
    const buckets = new Map<string, typeof filteredCombined>();
    const labels = new Map<string, string>();
    for (const it of filteredCombined) {
      const d = new Date(String(it.date));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = MONTH_FMT.format(d);
      if (!buckets.has(key)) buckets.set(key, [] as typeof filteredCombined);
      buckets.get(key)!.push(it);
      labels.set(key, label);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: labels.get(key) ?? key, items }));
  }, [filteredCombined]);

  const hasAny = expenses.length > 0 || payments.length > 0;
  const filtersActive = filterFriendId !== "all" || filterPeriod !== "all";

  return (
    <Layout>
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link href="/groups">
              <Button
                variant="ghost"
                size="sm"
                className="px-2 shrink-0"
                aria-label="Back to groups"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="ml-1 hidden sm:inline">Groups</span>
              </Button>
            </Link>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight truncate">
              Non-group expenses
            </h1>
          </div>
          <AddExpenseCTA />
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6 flex flex-wrap items-end gap-4 sm:gap-6">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your overall balance</p>
              <p
                className={cn(
                  "text-2xl sm:text-3xl font-bold mt-1 break-words",
                  net > 0
                    ? "text-primary"
                    : net < 0
                      ? "text-destructive"
                      : "text-foreground",
                )}
              >
                {net > 0
                  ? `+${formatCurrency(net, defaultCurrency)}`
                  : net < 0
                    ? `-${formatCurrency(Math.abs(net), defaultCurrency)}`
                    : formatCurrency(0, defaultCurrency)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {net > 0
                  ? "you are owed across friends"
                  : net < 0
                    ? "you owe across friends"
                    : "all settled up"}
              </p>
            </div>
            <div className="ml-auto">
              <p className="text-sm text-muted-foreground">Total expenses</p>
              <p className="text-xl sm:text-2xl font-semibold mt-1">{data?.count ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-1/3 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !hasAny ? (
          <div className="text-center py-12 px-4 border rounded-xl bg-card">
            <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              No non-group expenses yet
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Add an expense with a friend without selecting a group, and it
              will show up here.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="activity" className="space-y-4">
            <TabsList className="grid grid-cols-2 w-full max-w-sm">
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="balances">
                Balances{friends.length ? ` (${friends.length})` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="space-y-3 mt-2">
              {/* Filters */}
              <div className="flex flex-wrap gap-2 items-center">
                <Select
                  value={filterFriendId}
                  onValueChange={(v) => setFilterFriendId(v)}
                >
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue placeholder="All friends" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All friends</SelectItem>
                    {friends.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filterPeriod}
                  onValueChange={(v) => setFilterPeriod(v as FilterPeriod)}
                >
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue placeholder="All time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
                {filtersActive && (
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => {
                      setFilterFriendId("all");
                      setFilterPeriod("all");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {filteredCombined.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    {filtersActive
                      ? "No activity matches the current filters."
                      : "No activity yet."}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4 pb-6">
                  {groupedActivity.map((bucket) => (
                    <div key={bucket.key} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {bucket.label}
                      </p>
                      <div className="space-y-2">
                        {bucket.items.map((item) =>
                          item.kind === "expense" ? (
                            <ExpenseRow
                              key={item.id}
                              expense={item.data}
                              myId={myId}
                              friendNets={friendNets}
                            />
                          ) : (
                            <PaymentRow
                              key={item.id}
                              payment={item.data}
                              myId={myId}
                              currency={defaultCurrency}
                              onClick={() => setSelectedPayment(item.data)}
                            />
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="balances" className="space-y-3 mt-2">
              {friends.length === 0 ? (
                <div className="text-center py-12 px-4 border rounded-xl bg-card">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No friends in non-group expenses yet.
                  </p>
                </div>
              ) : (
                friends.map((f) => (
                  <FriendBalanceRow
                    key={f.id}
                    currency={defaultCurrency}
                    friend={f}
                    onSettle={(impact) =>
                      setSettleTarget({
                        friend: { id: f.id, name: f.name },
                        impact,
                      })
                    }
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}

        {settleTarget && myId && (
          <SettleUpWithFriendDialog
            friend={settleTarget.friend}
            currentUserId={myId}
            netBalance={settleTarget.impact}
            open
            onOpenChange={(o) => {
              if (!o) setSettleTarget(null);
            }}
          />
        )}
        {selectedPayment && myId && (
          <PaymentDetailDialog
            payment={selectedPayment}
            currentUserId={myId}
            open={!!selectedPayment}
            onOpenChange={(v) => {
              if (!v) setSelectedPayment(null);
            }}
          />
        )}
      </div>
    </Layout>
  );
}

function FriendBalanceRow({
  friend,
  onSettle,
  currency,
}: {
  friend: FriendRow;
  onSettle: (impact: number) => void;
  currency: string;
}) {
  const settled = Math.abs(friend.net) < 0.01;
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <Avatar className="h-10 w-10">
          {friend.avatarUrl && (
            <AvatarImage src={resolveAvatarUrl(friend.avatarUrl) ?? friend.avatarUrl} alt={friend.name} />
          )}
          <AvatarFallback>{initials(friend.name) || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{friend.name}</p>
          <p
            className={cn(
              "text-sm",
              settled
                ? "text-muted-foreground"
                : friend.net > 0
                  ? "text-primary"
                  : "text-destructive",
            )}
          >
            {settled
              ? "All settled up"
              : friend.net > 0
                ? `owes you ${formatCurrency(friend.net, currency)}`
                : `you owe ${formatCurrency(Math.abs(friend.net), currency)}`}
          </p>
        </div>
        {!settled && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => onSettle(friend.net)}
          >
            <HandCoins className="w-4 h-4 mr-1.5" /> Settle up
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseRow({
  expense,
  myId,
  friendNets,
}: {
  expense: ExpenseWithSplits;
  myId: string | undefined;
  friendNets: Record<string, number>;
}) {
  const [, navigate] = useLocation();
  const total = Number(expense.totalAmount);
  const iPaid = myId && expense.paidByUserId === myId;
  const mySplit = myId
    ? expense.splits.find((s) => s.userId === myId)
    : undefined;
  const myShare = mySplit ? Number(mySplit.amount) : 0;
  const owedToMe = iPaid ? total - myShare : 0;
  const iOwe = !iPaid && mySplit ? myShare : 0;

  const otherSplits = expense.splits.filter((s) => s.userId !== myId);
  const namedSplits = otherSplits.filter((s) => s.userId !== expense.paidByUserId);
  const otherNames = namedSplits.map((s) => s.user?.name ?? "").filter(Boolean);
  const peopleLine =
    otherNames.length > 0
      ? `with ${otherNames.slice(0, 3).join(", ")}${otherNames.length > 3 ? ` +${otherNames.length - 3}` : ""}`
      : "";

  const onlyCounterparty = otherSplits.length === 1 ? otherSplits[0] : null;
  const counterpartyNet = onlyCounterparty
    ? friendNets[onlyCounterparty.userId]
    : undefined;
  const isSettled =
    typeof counterpartyNet === "number" && Math.abs(counterpartyNet) < 0.01;

  const Icon = getCategoryIcon(expense.category);

  return (
    <Card
      onClick={() => navigate(`/expenses/${expense.id}`)}
      className="cursor-pointer hover:bg-accent/40 transition-colors"
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          {expense.paidByUser && (
            <div className="absolute -bottom-1 -right-1 ring-2 ring-background rounded-full">
              <UserAvatar
                name={expense.paidByUser.name}
                url={expense.paidByUser.avatarUrl}
                size={18}
              />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{expense.description}</p>
          <p className="text-sm text-muted-foreground truncate">
            {iPaid
              ? `You paid ${formatCurrency(total, expense.currency)}`
              : `${expense.paidByUser?.name ?? "Someone"} paid ${formatCurrency(total, expense.currency)}`}
            {peopleLine ? ` · ${peopleLine}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {expense.category ?? "General"} · {formatDate(expense.date)}
          </p>
        </div>
        <div className="text-right shrink-0">
          {isSettled ? (
            <>
              <p className="font-semibold text-muted-foreground">
                {iPaid
                  ? `+${formatCurrency(owedToMe, expense.currency)}`
                  : `-${formatCurrency(iOwe, expense.currency)}`}
              </p>
              <p className="text-xs text-primary">settled up</p>
            </>
          ) : owedToMe > 0 ? (
            <>
              <p className="font-semibold text-primary">
                +{formatCurrency(owedToMe, expense.currency)}
              </p>
              <p className="text-xs text-muted-foreground">you lent</p>
            </>
          ) : iOwe > 0 ? (
            <>
              <p className="font-semibold text-destructive">
                -{formatCurrency(iOwe, expense.currency)}
              </p>
              <p className="text-xs text-muted-foreground">you owe</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">not involved</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentRow({
  payment,
  myId,
  onClick,
  currency,
}: {
  payment: Payment;
  myId: string | undefined;
  onClick: () => void;
  currency: string;
}) {
  const fromYou = payment.fromUserId === myId;
  const toYou = payment.toUserId === myId;
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:bg-accent/40 transition-colors"
    >
      <CardContent className="py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <HandCoins className="w-5 h-5 text-green-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            {fromYou ? "You" : payment.fromUser.name} settled with{" "}
            {toYou ? "you" : payment.toUser.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(payment.date)}
            {payment.note ? ` · ${payment.note}` : ""}
          </p>
        </div>
        <div className="font-medium text-sm whitespace-nowrap text-green-700">
          {formatCurrency(payment.amount, currency)}
        </div>
      </CardContent>
    </Card>
  );
}
