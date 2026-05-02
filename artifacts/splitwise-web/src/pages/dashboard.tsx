import { useEffect, useMemo, useRef, useState } from "react";
import { useGetDashboardSummary, useGetActivity } from "@workspace/api-client-react";
import { formatCurrency, cn } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, Activity, DollarSign } from "lucide-react";
import { AddExpenseCTA } from "@/components/add-expense-cta";

const PAGE_SIZE = 8;

interface GroupRowData {
  href: string;
  name: string;
  balance: number;
  isVirtual: boolean;
  avatarUrl?: string | null;
}

export function DashboardPage() {
  // Polling cadence + background-polling are configured globally on the
  // QueryClient (5s, even when the tab is unfocused). No per-call override
  // needed here.
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: activities, isLoading: loadingActivities } = useGetActivity({ limit: 20 });

  // Build the combined groups list: virtual "Non-group expenses" entry first,
  // then real groups.
  const combinedGroups = useMemo<GroupRowData[]>(() => {
    if (!summary) return [];
    const virtualRow: GroupRowData = {
      href: "/non-group-expenses",
      name: "Non-group expenses",
      balance: summary.nonGroupNetBalance ?? 0,
      isVirtual: true,
    };
    const real: GroupRowData[] = (summary.groupSummaries ?? []).map((g) => ({
      href: `/groups/${g.groupId}`,
      name: g.groupName,
      balance: g.myNetBalance,
      isVirtual: false,
      avatarUrl: g.avatarUrl ?? null,
    }));
    return [virtualRow, ...real];
  }, [summary]);

  // Lazy load: render PAGE_SIZE rows initially, load more when sentinel scrolls
  // into view inside the inner scroll container.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  // Reset visible count if the source list shrinks below it.
  useEffect(() => {
    if (visibleCount > combinedGroups.length) {
      setVisibleCount(Math.max(PAGE_SIZE, combinedGroups.length));
    }
  }, [combinedGroups.length, visibleCount]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRootRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((c) => Math.min(combinedGroups.length, c + PAGE_SIZE));
          }
        }
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [combinedGroups.length, visibleCount]);

  const visibleGroups = combinedGroups.slice(0, visibleCount);
  const hasMore = visibleCount < combinedGroups.length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <AddExpenseCTA />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSummary ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className={cn("text-2xl font-bold", summary?.netBalance && summary.netBalance > 0 ? "text-primary" : summary?.netBalance && summary.netBalance < 0 ? "text-destructive" : "")}>
                  {formatCurrency(summary?.netBalance || 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">You Owe</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {loadingSummary ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(summary?.totalIOwe || 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">You Are Owed</CardTitle>
              <ArrowDownRight className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {loadingSummary ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(summary?.totalOwed || 0)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Your Groups</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {loadingSummary ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div
                  ref={scrollRootRef}
                  className="max-h-96 overflow-y-auto pr-1 -mr-1 space-y-2"
                >
                  {visibleGroups.map((group) => (
                    <Link key={group.href} href={group.href}>
                      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          {group.isVirtual ? (
                            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                              <DollarSign className="w-4 h-4 text-accent-foreground" />
                            </div>
                          ) : group.avatarUrl ? (
                            <img
                              src={group.avatarUrl}
                              alt={group.name}
                              className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-semibold text-accent-foreground">
                                {group.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className="font-medium truncate">{group.name}</span>
                        </div>
                        <span
                          className={cn(
                            "font-medium whitespace-nowrap",
                            group.balance > 0
                              ? "text-primary"
                              : group.balance < 0
                                ? "text-destructive"
                                : "text-muted-foreground",
                          )}
                        >
                          {group.balance > 0 ? "+" : ""}
                          {formatCurrency(group.balance)}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {hasMore && (
                    <div
                      ref={sentinelRef}
                      className="flex items-center justify-center py-3 text-xs text-muted-foreground"
                    >
                      Loading more…
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingActivities ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : activities?.length ? (
                <div className="max-h-96 overflow-y-auto pr-1 -mr-1 space-y-3">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg border bg-card">
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.groupName} • {new Date(activity.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="font-medium">
                        {formatCurrency(activity.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  No recent activity.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
