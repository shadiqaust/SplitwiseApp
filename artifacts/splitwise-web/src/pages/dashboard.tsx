import { useGetDashboardSummary, useGetActivity } from "@workspace/api-client-react";
import { formatCurrency, cn } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";

export function DashboardPage() {
  const POLL = { query: { refetchInterval: 15_000, refetchIntervalInBackground: true } } as const;
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary(POLL);
  const { data: activities, isLoading: loadingActivities } = useGetActivity({ limit: 20 }, POLL);

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

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
          <Card>
            <CardHeader>
              <CardTitle>Your Groups</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSummary ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : summary?.groupSummaries?.length ? (
                <div className="space-y-4">
                  {summary.groupSummaries.map((group) => (
                    <Link key={group.groupId} href={`/groups/${group.groupId}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer mb-2">
                        <span className="font-medium">{group.groupName}</span>
                        <span className={cn(
                          "font-medium",
                          group.myNetBalance > 0 ? "text-primary" : group.myNetBalance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {group.myNetBalance > 0 ? "+" : ""}{formatCurrency(group.myNetBalance)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  You are not in any groups yet.
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
                <div className="space-y-4">
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
