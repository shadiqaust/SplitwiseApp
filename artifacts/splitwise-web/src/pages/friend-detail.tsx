import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { ChevronLeft, ChevronRight, HandCoins, Users } from "lucide-react";
import {
  type ExpenseWithSplits,
  type Payment,
  type User,
  useGetMe,
  useListGroups,
} from "@workspace/api-client-react";

import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
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

type GroupBalance = {
  key: string;
  groupId: string | null;
  name: string;
  href: string;
  // Single net amount (positive = friend owes you). Currency is rendered with
  // the viewer's display symbol, so we no longer carry a per-currency list.
  amount: number;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function FriendAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const resolved = avatarUrl ? (resolveAvatarUrl(avatarUrl) ?? avatarUrl) : null;
  if (resolved) {
    return (
      <img
        src={resolved}
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
  const { data: groupsList } = useListGroups();
  const groupInfoById = useMemo(() => {
    const m = new Map<string, { name: string; currency: string }>();
    for (const g of groupsList ?? []) {
      m.set(g.id, { name: g.name, currency: g.currency || "USD" });
    }
    return m;
  }, [groupsList]);
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

  const groupBalances = useMemo<GroupBalance[]>(() => {
    if (!data || !myId) return [];
    // bucketKey -> signed sum (positive = friend owes me). Stored currencies
    // are ignored; the viewer's display symbol is applied at render.
    const buckets = new Map<string, number>();
    const bump = (bucket: string, delta: number) => {
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + delta);
    };
    for (const e of data.expenses) {
      const bucket = e.groupId ?? "__none__";
      if (e.paidByUserId === myId) {
        const fs = e.splits.find((s) => s.userId === friendId);
        if (fs) bump(bucket, parseFloat(String(fs.amount)));
      } else if (e.paidByUserId === friendId) {
        const ms = e.splits.find((s) => s.userId === myId);
        if (ms) bump(bucket, -parseFloat(String(ms.amount)));
      }
    }
    for (const p of data.payments) {
      const bucket = p.groupId ?? "__none__";
      const amt = parseFloat(String(p.amount));
      if (p.fromUserId === myId) bump(bucket, amt);
      else bump(bucket, -amt);
    }

    const out: GroupBalance[] = [];
    for (const [bucketKey, amount] of buckets) {
      if (bucketKey === "__none__") {
        out.push({
          key: "__none__",
          groupId: null,
          name: "Non-group expenses",
          href: "/non-group-expenses",
          amount,
        });
      } else {
        const info = groupInfoById.get(bucketKey);
        out.push({
          key: bucketKey,
          groupId: bucketKey,
          name: info?.name ?? "Group",
          href: `/groups/${bucketKey}`,
          amount,
        });
      }
    }
    // Sort: non-settled first, then settled. Within settled, non-group bucket last.
    const isSettled = (gb: GroupBalance) => Math.abs(gb.amount) < 0.01;
    out.sort((a, b) => {
      const aS = isSettled(a) ? 1 : 0;
      const bS = isSettled(b) ? 1 : 0;
      if (aS !== bS) return aS - bS;
      if (aS === 1) {
        if (a.groupId === null && b.groupId !== null) return 1;
        if (b.groupId === null && a.groupId !== null) return -1;
      }
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [data, myId, friendId, groupInfoById]);

  const friend = data?.friend;
  const net = data?.netBalance ?? 0;
  const hasAny =
    (data?.expenses.length ?? 0) > 0 || (data?.payments.length ?? 0) > 0;

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
            balances={data?.balances}
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
            <CardContent className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4">
              <FriendAvatar name={friend.name} avatarUrl={friend.avatarUrl ?? null} />
              <div className="flex-1 min-w-0">
                <p className="text-lg sm:text-xl font-bold truncate">{friend.name}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{friend.email}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                {Math.abs(net) < 0.01 ? (
                  <p className="text-sm text-muted-foreground">settled up</p>
                ) : (
                  (() => {
                    const owed = net > 0;
                    return (
                      <div>
                        <p
                          className={cn(
                            "text-base sm:text-lg font-bold whitespace-nowrap",
                            owed ? "text-green-600" : "text-red-500",
                          )}
                        >
                          {formatCurrency(Math.abs(net))}
                        </p>
                        <p className={cn("text-[10px] uppercase tracking-wide", owed ? "text-green-600" : "text-red-500")}>
                          {owed ? "owes you" : "you owe"}
                        </p>
                      </div>
                    );
                  })()
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !hasAny ? (
          <div className="text-center py-12 px-4 border rounded-xl bg-card">
            <p className="text-lg font-semibold mb-1">No activity yet</p>
            <p className="text-sm text-muted-foreground">
              Add an expense or record a payment with{" "}
              {friend?.name ?? "this friend"} to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              By group
            </p>
            {groupBalances.map((gb) => (
              <GroupBalanceRow key={gb.key} balance={gb} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function GroupBalanceRow({ balance }: { balance: GroupBalance }) {
  const [, navigate] = useLocation();
  const settled = Math.abs(balance.amount) < 0.01;
  const owed = balance.amount > 0;
  return (
    <Card
      onClick={() => navigate(balance.href)}
      className="cursor-pointer hover:bg-accent/40 transition-colors"
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{balance.name}</p>
          <p className="text-xs text-muted-foreground">
            {settled ? "all settled" : "open balance"}
          </p>
        </div>
        <div className="text-right shrink-0 space-y-1">
          {settled ? (
            <p className="text-sm text-muted-foreground">settled up</p>
          ) : (
            <div>
              <p
                className={cn(
                  "font-semibold whitespace-nowrap",
                  owed ? "text-green-600" : "text-red-500",
                )}
              >
                {formatCurrency(Math.abs(balance.amount))}
              </p>
              <p
                className={cn(
                  "text-[10px] uppercase tracking-wide",
                  owed ? "text-green-600" : "text-red-500",
                )}
              >
                {owed ? "owes you" : "you owe"}
              </p>
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </CardContent>
    </Card>
  );
}

