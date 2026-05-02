import { useListGroups, type GroupWithBalance } from "@workspace/api-client-react";
import { formatCurrency, cn, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, ChevronRight, DollarSign, LayoutGrid, List, Plus, Search, Users } from "lucide-react";
import { useViewMode, type ViewMode } from "@/hooks/use-view-mode";
import { useMemo, useState } from "react";

type StatusFilter = "all" | "owed" | "owe" | "settled";

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

type GroupItem = GroupWithBalance;

function groupByMonth(items: GroupItem[]): { key: string; label: string; items: GroupItem[] }[] {
  const sorted = [...items].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  const buckets = new Map<string, { key: string; label: string; items: GroupItem[] }>();
  for (const g of sorted) {
    const d = g.createdAt ? new Date(g.createdAt) : new Date(0);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = g.createdAt ? MONTH_FMT.format(d) : "Undated";
    if (!buckets.has(key)) buckets.set(key, { key, label, items: [] });
    buckets.get(key)!.items.push(g);
  }
  return Array.from(buckets.values());
}

export function GroupsPage() {
  const { data: groups, isLoading } = useListGroups();
  const [viewMode, setViewMode] = useViewMode("groups", "card");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    if (!groups) return [];
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (q) {
        const haystack: string[] = [g.name.toLowerCase()];
        if (g.createdAt) {
          const d = new Date(g.createdAt);
          haystack.push(formatDate(g.createdAt).toLowerCase());
          haystack.push(MONTH_FMT.format(d).toLowerCase());
          haystack.push(String(d.getFullYear()));
        }
        if (!haystack.some((h) => h.includes(q))) return false;
      }
      if (status === "owed" && !(g.myNetBalance > 0)) return false;
      if (status === "owe" && !(g.myNetBalance < 0)) return false;
      if (status === "settled" && g.myNetBalance !== 0) return false;
      return true;
    });
  }, [groups, search, status]);

  const sections = useMemo(() => groupByMonth(filtered), [filtered]);
  const hasFilter = search.trim().length > 0 || status !== "all";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Groups</h1>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => {
                if (v === "card" || v === "list") setViewMode(v as ViewMode);
              }}
              variant="outline"
              size="sm"
              aria-label="View mode"
            >
              <ToggleGroupItem
                value="card"
                aria-label="Card view"
                title="Card view"
                className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white data-[state=on]:border-indigo-600 data-[state=on]:hover:bg-indigo-700 data-[state=on]:hover:text-white"
              >
                <LayoutGrid className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                aria-label="List view"
                title="List view"
                className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white data-[state=on]:border-indigo-600 data-[state=on]:hover:bg-indigo-700 data-[state=on]:hover:text-white"
              >
                <List className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>
            <Link href="/groups/new">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Group
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search by name or date…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All balances</SelectItem>
              <SelectItem value="owed">You are owed</SelectItem>
              <SelectItem value="owe">You owe</SelectItem>
              <SelectItem value="settled">Settled up</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Link href="/non-group-expenses" className="block mb-4">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Non-group expenses</p>
                <p className="text-sm text-muted-foreground">
                  All expenses not tied to a group
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        {isLoading ? (
          viewMode === "card" ? (
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
          ) : (
            <div className="flex flex-col gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <Skeleton className="w-11 h-11 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : groups?.length && filtered.length ? (
          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.key} className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {section.label}
                </h2>
                {viewMode === "card" ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {section.items.map((group) => (
                      <Link key={group.id} href={`/groups/${group.id}`}>
                        <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                          <CardContent className="p-6 flex flex-col h-full">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                {group.avatarUrl ? (
                                  <img
                                    src={group.avatarUrl}
                                    alt={group.name}
                                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="w-11 h-11 rounded-lg bg-accent flex items-center justify-center shrink-0">
                                    <span className="text-base font-semibold text-accent-foreground">
                                      {group.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                <h3 className="font-semibold text-lg line-clamp-1">{group.name}</h3>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {group.memberCount} members
                              </p>
                              {group.createdAt ? (
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Created {formatDate(group.createdAt)}
                                </p>
                              ) : null}
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
                                {group.myNetBalance > 0 ? "+" : ""}{formatCurrency(group.myNetBalance, group.currency)}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {section.items.map((group) => (
                      <Link key={group.id} href={`/groups/${group.id}`}>
                        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                          <CardContent className="p-4 flex items-center gap-4">
                            {group.avatarUrl ? (
                              <img
                                src={group.avatarUrl}
                                alt={group.name}
                                className="w-11 h-11 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-accent flex items-center justify-center shrink-0">
                                <span className="text-base font-semibold text-accent-foreground">
                                  {group.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold line-clamp-1">{group.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {group.memberCount} members
                                </span>
                                {group.createdAt ? (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(group.createdAt)}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn(
                                "font-semibold",
                                group.myNetBalance > 0 ? "text-primary" : group.myNetBalance < 0 ? "text-destructive" : "text-muted-foreground"
                              )}>
                                {group.myNetBalance > 0 ? "+" : ""}{formatCurrency(group.myNetBalance, group.currency)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {group.myNetBalance > 0
                                  ? "you are owed"
                                  : group.myNetBalance < 0
                                    ? "you owe"
                                    : "settled"}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : groups?.length && hasFilter ? (
          <div className="text-center py-12 px-4 border rounded-xl bg-card">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No groups match your filters</h2>
            <p className="text-muted-foreground mb-4">Try a different search term or balance filter.</p>
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 px-4 border rounded-xl bg-card">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No groups yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create a group to start sharing expenses with friends, family, or roommates.
            </p>
            <Link href="/groups/new">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Create a Group
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
