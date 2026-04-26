import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getGetGroupQueryKey,
  getListExpensesQueryKey,
  getListGroupsQueryKey,
  getListPaymentsQueryKey,
  SplitType,
  useAddGroupMember,
  useCreateExpense,
  useCreatePayment,
  useGetGroup,
  useGetGroupBalances,
  useGetMe,
  useListExpenses,
  useListPayments,
  type GroupMember,
} from "@workspace/api-client-react";
import { Plus, UserPlus, HandCoins, Receipt, Search, Check } from "lucide-react";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn, formatCurrency } from "@/lib/format";
import { getErrorMessage } from "@/lib/error";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function MemberAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-accent text-accent-foreground font-medium"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {getInitials(name)}
    </div>
  );
}

function invalidateGroupData(groupId: number) {
  queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
  queryClient.invalidateQueries({
    queryKey: getGetGroupBalancesQueryKey(groupId),
  });
  queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey(groupId) });
  queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(groupId) });
  queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() });
}

interface UserResult {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div
      className="rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

function AddMemberDialog({ groupId }: { groupId: number }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);
  const { toast } = useToast();
  const addMember = useAddGroupMember();

  const { data: users = [], isFetching } = useQuery<UserResult[]>({
    queryKey: ["user-search", search, groupId],
    queryFn: async () => {
      const params = new URLSearchParams({ excludeGroupId: String(groupId) });
      if (search.trim()) params.set("q", search.trim());
      const token = localStorage.getItem("sw_auth_token");
      const res = await fetch(`/api/users/search?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    enabled: open,
    staleTime: 0,
  });

  const handleAdd = useCallback((user: UserResult) => {
    setAddingId(user.id);
    addMember.mutate(
      { groupId, data: { userId: user.id } as unknown as { email: string } },
      {
        onSuccess: () => {
          invalidateGroupData(groupId);
          toast({ title: `${user.name} added to group` });
          setOpen(false);
          setSearch("");
          setAddingId(null);
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to add member",
            description: getErrorMessage(err),
            variant: "destructive",
          });
          setAddingId(null);
        },
      },
    );
  }, [groupId, addMember, toast]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="w-4 h-4 mr-2" /> Add member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Search your friends by name or email to add them to this group.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Search friends by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {isFetching && users.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
          )}
          {!isFetching && users.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {search
                ? "No friends match that search."
                : "None of your friends are available to add."}
            </div>
          )}
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
              <UserAvatar name={user.name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={addingId === user.id}
                onClick={() => handleAdd(user)}
              >
                {addingId === user.id ? "Adding…" : "Add"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddExpenseDialog({
  groupId,
  members,
  currentUserId,
}: {
  groupId: number;
  members: GroupMember[];
  currentUserId: number;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<number>(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [participantIds, setParticipantIds] = useState<Set<number>>(
    new Set(members.map((m) => m.userId)),
  );
  const [exactAmounts, setExactAmounts] = useState<Record<number, string>>({});
  const [percentages, setPercentages] = useState<Record<number, string>>({});
  const { toast } = useToast();
  const createExpense = useCreateExpense();

  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount("");
      setPaidByUserId(currentUserId);
      setSplitType(SplitType.equal);
      setParticipantIds(new Set(members.map((m) => m.userId)));
      setExactAmounts({});
      setPercentages({});
    }
  }, [open, currentUserId, members]);

  const toggleParticipant = (userId: number) => {
    const next = new Set(participantIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setParticipantIds(next);
  };

  const buildSplits = (): Array<{
    userId: number;
    amount: number;
    percentage?: number;
  }> => {
    const total = parseFloat(amount);
    const ids = Array.from(participantIds);
    if (splitType === SplitType.equal) {
      if (ids.length === 0) return [];
      const share = Math.round((total / ids.length) * 100) / 100;
      const remainder = Math.round((total - share * ids.length) * 100) / 100;
      return ids.map((userId, i) => ({
        userId,
        amount: i === 0 ? share + remainder : share,
      }));
    }
    if (splitType === SplitType.exact) {
      return ids.map((userId) => ({
        userId,
        amount: parseFloat(exactAmounts[userId] ?? "0") || 0,
      }));
    }
    return ids.map((userId) => {
      const pct = parseFloat(percentages[userId] ?? "0") || 0;
      return {
        userId,
        amount: Math.round(total * (pct / 100) * 100) / 100,
        percentage: pct,
      };
    });
  };

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
    if (participantIds.size === 0) {
      toast({
        title: "Select at least one participant",
        variant: "destructive",
      });
      return;
    }

    const splits = buildSplits();

    if (splitType === SplitType.exact) {
      const sum = splits.reduce((a, s) => a + s.amount, 0);
      if (Math.abs(sum - total) > 0.01) {
        toast({
          title: `Exact amounts must sum to ${formatCurrency(total)}`,
          variant: "destructive",
        });
        return;
      }
    }
    if (splitType === SplitType.percentage) {
      const sum = splits.reduce((a, s) => a + (s.percentage ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        toast({
          title: "Percentages must sum to 100",
          variant: "destructive",
        });
        return;
      }
    }

    createExpense.mutate(
      {
        groupId,
        data: {
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
          invalidateGroupData(groupId);
          toast({ title: "Expense added" });
          setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Add expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="Dinner, Groceries..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                value={String(paidByUserId)}
                onValueChange={(v) => setPaidByUserId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={String(m.userId)}>
                      {m.userId === currentUserId ? "You" : m.user.name}
                    </SelectItem>
                  ))}
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
                  <SelectItem value={SplitType.equal}>Equally</SelectItem>
                  <SelectItem value={SplitType.exact}>
                    Exact amounts
                  </SelectItem>
                  <SelectItem value={SplitType.percentage}>
                    Percentages
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Participants</Label>
            <div className="border rounded-md divide-y">
              {members.map((m) => {
                const checked = participantIds.has(m.userId);
                return (
                  <label
                    key={m.userId}
                    className="flex items-center gap-3 p-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipant(m.userId)}
                    />
                    <MemberAvatar name={m.user.name} size={28} />
                    <span className="flex-1 text-sm">
                      {m.userId === currentUserId ? "You" : m.user.name}
                    </span>
                    {checked && splitType === SplitType.exact ? (
                      <Input
                        className="w-24"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={exactAmounts[m.userId] ?? ""}
                        onChange={(e) =>
                          setExactAmounts((prev) => ({
                            ...prev,
                            [m.userId]: e.target.value,
                          }))
                        }
                      />
                    ) : null}
                    {checked && splitType === SplitType.percentage ? (
                      <Input
                        className="w-20"
                        type="number"
                        step="0.01"
                        placeholder="%"
                        value={percentages[m.userId] ?? ""}
                        onChange={(e) =>
                          setPercentages((prev) => ({
                            ...prev,
                            [m.userId]: e.target.value,
                          }))
                        }
                      />
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createExpense.isPending}>
              {createExpense.isPending ? "Saving..." : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettleUpDialog({
  groupId,
  members,
  currentUserId,
}: {
  groupId: number;
  members: GroupMember[];
  currentUserId: number;
}) {
  const [open, setOpen] = useState(false);
  const [fromUserId, setFromUserId] = useState<number>(currentUserId);
  const [toUserId, setToUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const createPayment = useCreatePayment();

  useEffect(() => {
    if (open) {
      setFromUserId(currentUserId);
      const other = members.find((m) => m.userId !== currentUserId);
      setToUserId(other?.userId ?? null);
      setAmount("");
      setNote("");
    }
  }, [open, currentUserId, members]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!toUserId) {
      toast({ title: "Select recipient", variant: "destructive" });
      return;
    }
    if (fromUserId === toUserId) {
      toast({ title: "From and to must differ", variant: "destructive" });
      return;
    }
    if (!value || value <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    createPayment.mutate(
      {
        groupId,
        data: {
          fromUserId,
          toUserId,
          amount: value,
          note: note.trim() || null,
          date: new Date().toISOString().slice(0, 10),
        },
      },
      {
        onSuccess: () => {
          invalidateGroupData(groupId);
          toast({ title: "Payment recorded" });
          setOpen(false);
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to record payment",
            description: getErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <HandCoins className="w-4 h-4 mr-2" /> Settle up
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settle up</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From</Label>
              <Select
                value={String(fromUserId)}
                onValueChange={(v) => setFromUserId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={String(m.userId)}>
                      {m.userId === currentUserId ? "You" : m.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Select
                value={toUserId !== null ? String(toUserId) : ""}
                onValueChange={(v) => setToUserId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={String(m.userId)}>
                      {m.userId === currentUserId ? "You" : m.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input
              placeholder="Cash / Venmo / etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createPayment.isPending}>
              {createPayment.isPending ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GroupDetailPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = Number(params.groupId);

  const POLL = { query: { refetchInterval: 15_000 } } as const;
  const me = useGetMe(POLL);
  const group = useGetGroup(groupId, POLL);
  const expenses = useListExpenses(groupId, POLL);
  const payments = useListPayments(groupId, POLL);
  const balances = useGetGroupBalances(groupId, POLL);

  const myUserId = me.data?.id ?? -1;
  const members = group.data?.members ?? [];

  const combined = useMemo(() => {
    const e = (expenses.data ?? []).map((x) => ({
      kind: "expense" as const,
      id: `e-${x.id}`,
      data: x,
      date: x.date,
      createdAt: x.createdAt,
    }));
    const p = (payments.data ?? []).map((x) => ({
      kind: "payment" as const,
      id: `p-${x.id}`,
      data: x,
      date: x.date,
      createdAt: x.createdAt,
    }));
    return [...e, ...p].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }, [expenses.data, payments.data]);

  if (group.isLoading || !group.data) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {group.data.name}
            </h1>
            {group.data.description ? (
              <p className="text-muted-foreground mt-1">
                {group.data.description}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {me.data ? (
              <>
                <SettleUpDialog
                  groupId={groupId}
                  members={members}
                  currentUserId={myUserId}
                />
                <AddExpenseDialog
                  groupId={groupId}
                  members={members}
                  currentUserId={myUserId}
                />
              </>
            ) : null}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <MemberAvatar name={m.user.name} />
                  <span className="text-sm">
                    {m.userId === myUserId ? "You" : m.user.name}
                  </span>
                </div>
              ))}
              <AddMemberDialog groupId={groupId} />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="activity">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="space-y-2">
            {combined.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No expenses yet. Add your first one.
                </CardContent>
              </Card>
            ) : (
              combined.map((item) => {
                if (item.kind === "expense") {
                  const e = item.data;
                  const youPaid = e.paidByUserId === myUserId;
                  const yourSplit = e.splits.find(
                    (s) => s.userId === myUserId,
                  );
                  const yourShare = yourSplit?.amount ?? 0;
                  const lentOrBorrowed = youPaid
                    ? e.totalAmount - yourShare
                    : -yourShare;
                  return (
                    <Card key={item.id}>
                      <CardContent className="py-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <Receipt className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {e.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {youPaid ? "You" : e.paidByUser.name} paid{" "}
                            {formatCurrency(e.totalAmount)} ·{" "}
                            {formatDate(e.date)}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "font-medium text-sm whitespace-nowrap",
                            lentOrBorrowed > 0
                              ? "text-primary"
                              : lentOrBorrowed < 0
                                ? "text-destructive"
                                : "text-muted-foreground",
                          )}
                        >
                          {lentOrBorrowed > 0
                            ? `+${formatCurrency(lentOrBorrowed)}`
                            : lentOrBorrowed < 0
                              ? `-${formatCurrency(Math.abs(lentOrBorrowed))}`
                              : formatCurrency(0)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                const p = item.data;
                const fromYou = p.fromUserId === myUserId;
                const toYou = p.toUserId === myUserId;
                return (
                  <Card key={item.id}>
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                        <HandCoins className="w-5 h-5 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {fromYou ? "You" : p.fromUser.name} paid{" "}
                          {toYou ? "you" : p.toUser.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.date)}
                          {p.note ? ` · ${p.note}` : ""}
                        </p>
                      </div>
                      <div className="font-medium text-sm whitespace-nowrap">
                        {formatCurrency(p.amount)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="balances" className="space-y-2">
            {balances.data && balances.data.length > 0 ? (
              balances.data.map((b, i) => (
                <Card key={`${b.fromUserId}-${b.toUserId}-${i}`}>
                  <CardContent className="py-4 flex items-center gap-3">
                    <MemberAvatar name={b.fromUser.name} />
                    <p className="flex-1 text-sm">
                      <span className="font-semibold">
                        {b.fromUserId === myUserId ? "You" : b.fromUser.name}
                      </span>{" "}
                      owe{b.fromUserId === myUserId ? "" : "s"}{" "}
                      <span className="font-semibold">
                        {b.toUserId === myUserId ? "you" : b.toUser.name}
                      </span>
                    </p>
                    <div className="text-destructive font-medium">
                      {formatCurrency(b.amount)}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  All settled up.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
