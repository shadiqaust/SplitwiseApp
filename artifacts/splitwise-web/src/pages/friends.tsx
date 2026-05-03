import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Search, Plus, HandCoins } from "lucide-react";
import { AddExpenseWithFriendDialog } from "@/components/add-expense-with-friend-dialog";
import { SettleUpWithFriendDialog } from "@/components/settle-up-with-friend-dialog";
import { Link } from "wouter";
import { resolveAvatarUrl } from "@/lib/avatar-presets";

interface Friend {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  netBalance: number;
  balances: { currency: string; amount: number }[];
  sharedGroups: { id: number; name: string }[];
  isDirect: boolean;
}

interface UserResult {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function FriendAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (avatarUrl) return <img src={resolveAvatarUrl(avatarUrl) ?? avatarUrl} alt={name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />;
  return (
    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

function BalanceBadge({ balances }: { balances: { currency: string; amount: number }[] }) {
  // Currency is now a per-viewer display preference. Collapse all per-currency
  // rows into a single signed sum and render it with the viewer's symbol.
  const net = balances.reduce((acc, b) => acc + b.amount, 0);
  if (Math.abs(net) < 0.01) {
    return <span className="text-sm text-muted-foreground whitespace-nowrap">settled up</span>;
  }
  const isOwed = net > 0;
  return (
    <div className="text-right space-y-0.5">
      <div className={cn(isOwed ? "text-green-600" : "text-red-500")}>
        <p className="text-[10px] font-medium uppercase tracking-wide">
          {isOwed ? "owes you" : "you owe"}
        </p>
        <p className="text-sm font-bold whitespace-nowrap">
          {formatCurrency(Math.abs(net))}
        </p>
      </div>
    </div>
  );
}

function AddFriendDialog({ existingFriendIds }: { existingFriendIds: Set<number> }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isFetching } = useQuery<UserResult[]>({
    queryKey: ["user-search-friends", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/users/search?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    enabled: open,
    staleTime: 0,
    refetchInterval: false, // search dialog — don't poll
  });

  const addMutation = useMutation({
    mutationFn: async (friendId: number) => {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ friendId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add friend");
      }
    },
    onSuccess: (_data, friendId) => {
      const user = users.find((u) => u.id === friendId);
      toast({ title: `${user?.name ?? "Friend"} added!` });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="w-4 h-4 mr-2" /> Add Friend
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a Friend</DialogTitle>
          <DialogDescription>Search for someone by name or email.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {isFetching && users.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">Searching…</p>
          )}
          {!isFetching && users.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {search ? "No users found." : "Start typing to search users."}
            </p>
          )}
          {users.map((user) => {
            const alreadyFriend = existingFriendIds.has(user.id);
            const isPending = addMutation.isPending && addMutation.variables === user.id;
            return (
              <div key={user.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <FriendAvatar name={user.name} avatarUrl={user.avatarUrl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                {alreadyFriend ? (
                  <span className="text-xs text-muted-foreground">Friends</span>
                ) : (
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => addMutation.mutate(user.id)}>
                    {isPending ? "Adding…" : "Add"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FriendsPage() {
  const [search, setSearch] = useState("");
  const [expenseFriend, setExpenseFriend] = useState<Friend | null>(null);
  const [settleFriend, setSettleFriend] = useState<Friend | null>(null);
  const me = useGetMe();

  const { data: friends, isLoading, isError } = useQuery<Friend[]>({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load friends");
      return res.json();
    },
    staleTime: 30_000,
    // refetchInterval / refetchIntervalInBackground are inherited from
    // QueryClient defaults (5s polling, runs in background).
  });

  const filtered = useMemo(() => {
    if (!friends) return [];
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q),
    );
  }, [friends, search]);

  const existingFriendIds = useMemo(() => new Set((friends ?? []).map((f) => f.id)), [friends]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">Friends</h1>
            <p className="text-muted-foreground text-sm mt-1">
              People you share groups with and your balance with each.
            </p>
          </div>
          <AddFriendDialog existingFriendIds={existingFriendIds} />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search friends…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* States */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4 py-4">
                  <Skeleton className="w-11 h-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-10 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isError && <p className="text-destructive text-sm">Failed to load friends. Please try again.</p>}

        {!isLoading && friends?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-1">No friends yet</p>
              <p className="text-sm">Use "Add Friend" to connect with someone, or add members to a group.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && friends && friends.length > 0 && filtered.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-6">No friends match your search.</p>
        )}

        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((friend) => (
              <Card
                key={friend.id}
                className="hover:shadow-sm transition-shadow"
              >
                <CardContent className="py-4 px-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <Link
                      href={`/friends/${friend.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
                    >
                      <FriendAvatar name={friend.name} avatarUrl={friend.avatarUrl} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate hover:underline">
                          {friend.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {friend.email}
                        </p>
                        {friend.sharedGroups.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {friend.sharedGroups.map((g) => g.name).join(", ")}
                          </p>
                        )}
                      </div>
                    </Link>
                    <div className="sm:hidden ml-auto">
                      <BalanceBadge balances={friend.balances ?? []} />
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <BalanceBadge balances={friend.balances ?? []} />
                  </div>
                  <div className="flex flex-row sm:flex-col gap-1.5 sm:shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      disabled={!me.data?.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpenseFriend(friend);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add expense
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      disabled={!me.data?.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettleFriend(friend);
                      }}
                    >
                      <HandCoins className="w-4 h-4 mr-1" /> Settle up
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {expenseFriend && me.data?.id && (
          <AddExpenseWithFriendDialog
            friend={expenseFriend}
            currentUserId={me.data.id}
            open
            onOpenChange={(o) => {
              if (!o) setExpenseFriend(null);
            }}
          />
        )}

        {settleFriend && me.data?.id && (
          <SettleUpWithFriendDialog
            friend={settleFriend}
            currentUserId={me.data.id}
            netBalance={settleFriend.netBalance}
            balances={settleFriend.balances}
            open
            onOpenChange={(o) => {
              if (!o) setSettleFriend(null);
            }}
          />
        )}
      </div>
    </Layout>
  );
}
