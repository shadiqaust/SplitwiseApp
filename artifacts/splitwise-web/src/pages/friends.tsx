import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  SplitType,
  useCreateFriendExpense,
  useGetMe,
  getGetDashboardSummaryQueryKey,
  getGetActivityQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import { UserPlus, Search, Plus } from "lucide-react";

interface Friend {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  netBalance: number;
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
  if (avatarUrl) return <img src={avatarUrl} alt={name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />;
  return (
    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

function BalanceBadge({ amount }: { amount: number }) {
  if (Math.abs(amount) < 0.01) return <span className="text-sm text-muted-foreground whitespace-nowrap">settled up</span>;
  const isOwed = amount > 0;
  return (
    <div className={cn("text-right", isOwed ? "text-green-600" : "text-red-500")}>
      <p className="text-xs font-medium">{isOwed ? "owes you" : "you owe"}</p>
      <p className="text-base font-bold">{formatCurrency(Math.abs(amount))}</p>
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
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                  {user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
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

function AddExpenseWithFriendDialog({
  friend,
  currentUserId,
  open,
  onOpenChange,
}: {
  friend: Friend;
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const friendId = String(friend.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createExpense = useCreateFriendExpense();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [myAmount, setMyAmount] = useState("");
  const [friendAmount, setFriendAmount] = useState("");

  // Reset form whenever the dialog reopens.
  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount("");
      setPaidByUserId(currentUserId);
      setSplitType(SplitType.equal);
      setMyAmount("");
      setFriendAmount("");
    }
  }, [open, currentUserId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(amount);
    if (!description.trim()) {
      toast({ title: "Description required", variant: "destructive" });
      return;
    }
    if (!total || total <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    let splits: Array<{ userId: string; amount: number }> = [];
    if (splitType === SplitType.equal) {
      const totalCents = Math.round(total * 100);
      const half = Math.floor(totalCents / 2);
      const extra = totalCents - half * 2;
      splits = [
        { userId: currentUserId, amount: (half + extra) / 100 },
        { userId: friendId, amount: half / 100 },
      ];
    } else {
      const mine = parseFloat(myAmount) || 0;
      const theirs = parseFloat(friendAmount) || 0;
      if (Math.abs(mine + theirs - total) > 0.01) {
        toast({
          title: `Exact amounts must sum to ${formatCurrency(total)}`,
          variant: "destructive",
        });
        return;
      }
      splits = [
        { userId: currentUserId, amount: mine },
        { userId: friendId, amount: theirs },
      ];
    }

    createExpense.mutate(
      {
        data: {
          friendUserId: friendId,
          description: description.trim(),
          totalAmount: total,
          currency: "USD",
          splitType,
          paidByUserId,
          date: new Date().toISOString().slice(0, 10),
          splits,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetActivityQueryKey(),
          });
          toast({ title: `Expense added with ${friend.name}` });
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to add expense",
            description: getErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Add expense with {friend.name}</DialogTitle>
          <DialogDescription>
            This expense isn't tied to a group — just between you and {friend.name}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="Dinner, Movie, Cab…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select
                value={paidByUserId}
                onValueChange={setPaidByUserId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currentUserId}>You</SelectItem>
                  <SelectItem value={friendId}>{friend.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Split</Label>
              <Select
                value={splitType}
                onValueChange={(v) => setSplitType(v as SplitType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SplitType.equal}>Equally (50/50)</SelectItem>
                  <SelectItem value={SplitType.exact}>Exact amounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {splitType === SplitType.exact && (
            <div className="space-y-2">
              <Label>Exact amounts</Label>
              <div className="border rounded-md divide-y">
                <div className="flex items-center gap-3 p-3">
                  <span className="flex-1 text-sm">You</span>
                  <Input
                    className="w-28"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={myAmount}
                    onChange={(e) => setMyAmount(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3 p-3">
                  <span className="flex-1 text-sm">{friend.name}</span>
                  <Input
                    className="w-28"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={friendAmount}
                    onChange={(e) => setFriendAmount(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={createExpense.isPending}>
              {createExpense.isPending ? "Saving…" : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FriendsPage() {
  const [search, setSearch] = useState("");
  const [expenseFriend, setExpenseFriend] = useState<Friend | null>(null);
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
        <div className="flex items-center justify-between gap-4">
          <div>
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
              <Card key={friend.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center gap-4 py-4">
                  <FriendAvatar name={friend.name} avatarUrl={friend.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{friend.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{friend.email}</p>
                    {friend.sharedGroups.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {friend.sharedGroups.map((g) => g.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <BalanceBadge amount={friend.netBalance} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!me.data?.id}
                    onClick={() => setExpenseFriend(friend)}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add expense
                  </Button>
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
      </div>
    </Layout>
  );
}
