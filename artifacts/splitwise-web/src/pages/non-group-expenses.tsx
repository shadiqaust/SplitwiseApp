import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, DollarSign, HandCoins } from "lucide-react";
import {
  type ExpenseWithSplits,
  useGetMe,
} from "@workspace/api-client-react";

import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SettleUpWithFriendDialog,
  type SettleFriend,
} from "@/components/settle-up-with-friend-dialog";
import { cn, formatCurrency } from "@/lib/format";

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

interface NonGroupResponse {
  myNetBalance: number;
  count: number;
  expenses: ExpenseWithSplits[];
  /** Per-friend net for non-group activity only (positive = friend owes me). */
  friendNets?: Record<string, number>;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function NonGroupExpensesPage() {
  const me = useGetMe();
  const myId = me.data?.id;
  const [settleTarget, setSettleTarget] = useState<{
    friend: SettleFriend;
    impact: number;
  } | null>(null);

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
  const net = data?.myNetBalance ?? 0;

  const grouped = useMemo(() => {
    const buckets = new Map<string, ExpenseWithSplits[]>();
    const labels = new Map<string, string>();
    const sorted = [...expenses].sort((a, b) =>
      String(a.date) < String(b.date) ? 1 : -1,
    );
    for (const e of sorted) {
      const d = new Date(String(e.date));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = MONTH_FMT.format(d);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e);
      labels.set(key, label);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: labels.get(key) ?? key, items }));
  }, [expenses]);

  return (
    <Layout>
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/groups">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Groups
              </Button>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight truncate">
              Non-group expenses
            </h1>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Your overall balance</p>
              <p
                className={cn(
                  "text-3xl font-bold mt-1",
                  net > 0
                    ? "text-primary"
                    : net < 0
                      ? "text-destructive"
                      : "text-foreground",
                )}
              >
                {net > 0
                  ? `+${formatCurrency(net)}`
                  : net < 0
                    ? `-${formatCurrency(Math.abs(net))}`
                    : formatCurrency(0)}
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
              <p className="text-2xl font-semibold mt-1">{data?.count ?? 0}</p>
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
        ) : expenses.length === 0 ? (
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
          <div className="space-y-6">
            {grouped.map((bucket) => (
              <div key={bucket.key} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {bucket.label}
                </p>
                <div className="space-y-3">
                  {bucket.items.map((e) => (
                    <ExpenseRow
                      key={e.id}
                      expense={e}
                      myId={myId}
                      friendNets={data?.friendNets}
                      onSettle={(friend, impact) =>
                        setSettleTarget({ friend, impact })
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
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
      </div>
    </Layout>
  );
}

function ExpenseRow({
  expense,
  myId,
  friendNets,
  onSettle,
}: {
  expense: ExpenseWithSplits;
  myId: string | undefined;
  friendNets?: Record<string, number>;
  onSettle: (friend: SettleFriend, impact: number) => void;
}) {
  const total = Number(expense.totalAmount);
  const iPaid = myId && expense.paidByUserId === myId;
  const mySplit = myId
    ? expense.splits.find((s) => s.userId === myId)
    : undefined;
  const myShare = mySplit ? Number(mySplit.amount) : 0;
  const owedToMe = iPaid ? total - myShare : 0;
  const iOwe = !iPaid && mySplit ? myShare : 0;

  const otherSplits = expense.splits.filter((s) => s.userId !== myId);
  const otherNames = otherSplits.map((s) => s.user?.name ?? "").filter(Boolean);
  const peopleLine =
    otherNames.length > 0
      ? `with ${otherNames.slice(0, 3).join(", ")}${otherNames.length > 3 ? ` +${otherNames.length - 3}` : ""}`
      : "";

  // 1-on-1 counterparty (if any).
  const onlyCounterparty =
    otherSplits.length === 1 ? otherSplits[0] : null;
  const counterpartyId = onlyCounterparty?.userId;
  const counterpartyNet =
    counterpartyId !== undefined && friendNets
      ? friendNets[counterpartyId]
      : undefined;
  const isSettled =
    typeof counterpartyNet === "number" && Math.abs(counterpartyNet) < 0.01;

  // Settle button only on unambiguous 1-on-1 rows that aren't already settled.
  let settleFriend: SettleFriend | null = null;
  let settleImpact = 0;
  if (onlyCounterparty && !isSettled) {
    if (owedToMe > 0 && onlyCounterparty.user) {
      settleFriend = {
        id: onlyCounterparty.userId,
        name: onlyCounterparty.user.name,
      };
      settleImpact = counterpartyNet ?? Number(onlyCounterparty.amount);
    } else if (iOwe > 0 && expense.paidByUser) {
      settleFriend = {
        id: expense.paidByUserId,
        name: expense.paidByUser.name,
      };
      settleImpact = counterpartyNet ?? -iOwe;
    }
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
            {peopleLine ? ` · ${peopleLine}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {expense.category ?? "General"} · {expense.date}
          </p>
        </div>
        <div className="text-right shrink-0">
          {isSettled ? (
            <>
              <p className="font-semibold text-muted-foreground">
                {iPaid
                  ? `+${formatCurrency(owedToMe)}`
                  : `-${formatCurrency(iOwe)}`}
              </p>
              <p className="text-xs text-primary">settled up</p>
            </>
          ) : owedToMe > 0 ? (
            <>
              <p className="font-semibold text-primary">
                +{formatCurrency(owedToMe)}
              </p>
              <p className="text-xs text-muted-foreground">you lent</p>
            </>
          ) : iOwe > 0 ? (
            <>
              <p className="font-semibold text-destructive">
                -{formatCurrency(iOwe)}
              </p>
              <p className="text-xs text-muted-foreground">you owe</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">not involved</p>
          )}
        </div>
        {settleFriend && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => onSettle(settleFriend!, settleImpact)}
          >
            <HandCoins className="w-4 h-4 mr-1.5" /> Settle up
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
