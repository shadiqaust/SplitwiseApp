import { useListGroups } from "@workspace/api-client-react";
import { formatCurrency, cn } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";

export function GroupsPage() {
  const { data: groups, isLoading } = useListGroups();

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
          <Link href="/groups/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Group
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-1/2 mb-4" />
                  <Skeleton className="h-4 w-1/3 mb-2" />
                  <Skeleton className="h-8 w-1/4 mt-4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groups?.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <Link key={group.id} href={`/groups/${group.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg line-clamp-1">{group.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {group.memberCount} members
                      </p>
                      {group.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{group.description}</p>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground mb-1">Your balance</p>
                      <p className={cn(
                        "font-bold text-lg",
                        group.myNetBalance > 0 ? "text-primary" : group.myNetBalance < 0 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {group.myNetBalance > 0 ? "+" : ""}{formatCurrency(group.myNetBalance)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4 border rounded-xl bg-card">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No groups yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create a group to start sharing expenses with friends, family, or roommates.
            </p>
            <Link href="/groups/new">
              <Button>Create a Group</Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
