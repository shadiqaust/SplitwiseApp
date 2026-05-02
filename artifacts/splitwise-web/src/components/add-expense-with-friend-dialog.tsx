import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import {
  SplitType,
  useCreateFriendExpense,
  getGetDashboardSummaryQueryKey,
  getGetActivityQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency } from "@/lib/format";
import { getCategoryIcon, guessCategory } from "@/lib/expense-categories";

const EXPENSE_CATEGORIES = [
  "General",
  "Food",
  "Groceries",
  "Transport",
  "Rent",
  "Utilities",
  "Entertainment",
  "Travel",
  "Shopping",
  "Other",
];

export interface FriendLike {
  id: string | number;
  name: string;
}

interface ApiFriend {
  id: string | number;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AddExpenseWithFriendDialog({
  friends,
  currentUserId,
  open,
  onOpenChange,
}: {
  friends: FriendLike[];
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createExpense = useCreateFriendExpense();

  // UI-only split mode. "loan" = lent the full amount to the friend (single-friend only).
  type Mode = "equal" | "exact" | "loan";

  // Editable friend list (initial value comes from `friends` prop, but the user
  // can add more or remove some inside the dialog).
  const [friendsList, setFriendsList] = useState<FriendLike[]>(friends);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>(currentUserId);
  const [mode, setMode] = useState<Mode>("equal");
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const friendIds = useMemo(
    () => friendsList.map((f) => String(f.id)),
    [friendsList],
  );
  const isMulti = friendsList.length > 1;

  // Participants: me + friends. "You" is always first.
  const participants = useMemo(
    () => [
      { id: currentUserId, name: "You", isMe: true },
      ...friendsList.map((f) => ({
        id: String(f.id),
        name: f.name,
        isMe: false,
      })),
    ],
    [currentUserId, friendsList],
  );

  // Fetch all friends for the "Add more friends" picker.
  const allFriendsQuery = useQuery<ApiFriend[]>({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load friends");
      return res.json();
    },
    enabled: open,
  });

  // Initialize state only on the open false→true transition. We intentionally
  // do NOT depend on `friends` or `currentUserId` here — the parent passes a
  // fresh `[expenseFriend]` array on every render, which would otherwise wipe
  // user input mid-edit.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setFriendsList(friends);
      setDescription("");
      setCategory("General");
      setAmount("");
      setPaidByUserId(currentUserId);
      setMode("equal");
      setExactAmounts({});
      setPickerOpen(false);
    }
    wasOpenRef.current = open;
  }, [open, currentUserId, friends]);

  // In loan mode, the lender (you) is always the payer.
  useEffect(() => {
    if (mode === "loan" && paidByUserId !== currentUserId) {
      setPaidByUserId(currentUserId);
    }
  }, [mode, paidByUserId, currentUserId]);

  // When transitioning to multi-friend, multi requires "equal" split.
  useEffect(() => {
    if (isMulti && mode !== "equal") setMode("equal");
  }, [isMulti, mode]);

  // If the current payer was removed, reset to "You".
  useEffect(() => {
    const ids = new Set([currentUserId, ...friendIds]);
    if (!ids.has(paidByUserId)) setPaidByUserId(currentUserId);
  }, [friendIds, currentUserId, paidByUserId]);

  const addFriend = (f: ApiFriend) => {
    setFriendsList((prev) => {
      const key = String(f.id);
      if (prev.some((x) => String(x.id) === key)) return prev;
      return [...prev, { id: f.id, name: f.name }];
    });
  };
  const removeFriend = (id: string | number) => {
    setFriendsList((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((f) => String(f.id) !== String(id));
    });
  };

  const availableFriends = useMemo(() => {
    const have = new Set(friendIds);
    return (allFriendsQuery.data ?? []).filter(
      (f) => !have.has(String(f.id)) && String(f.id) !== currentUserId,
    );
  }, [allFriendsQuery.data, friendIds, currentUserId]);

  const updateExactAmount = (userId: string, value: string) => {
    setExactAmounts((prev) => ({ ...prev, [userId]: value }));
  };

  const computeEqualSplits = (total: number) => {
    const totalCents = Math.round(total * 100);
    const baseCents = Math.floor(totalCents / participants.length);
    let remainder = totalCents - baseCents * participants.length;
    return participants.map((p) => {
      const cents = baseCents + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return { userId: p.id, amount: cents / 100 };
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

    // Multi-friend non-group expenses must split equally (API constraint and
    // product invariant). Derive the effective mode at submit time so a stale
    // `mode` value can't slip through if the user submits before the
    // multi→equal effect commits.
    const effectiveMode: Mode = isMulti ? "equal" : mode;

    let splits: Array<{ userId: string; amount: number }> = [];
    let splitTypeForApi: SplitType;
    let paidByForApi = paidByUserId;
    if (effectiveMode === "equal") {
      splitTypeForApi = SplitType.equal;
      splits = computeEqualSplits(total);
    } else if (effectiveMode === "loan") {
      // I lent the full amount to the friend → I pay everything, friend owes 100%.
      splitTypeForApi = SplitType.exact;
      paidByForApi = currentUserId;
      const friendId = friendsList[0] ? String(friendsList[0].id) : "";
      splits = [
        { userId: currentUserId, amount: 0 },
        { userId: friendId, amount: total },
      ];
    } else {
      splitTypeForApi = SplitType.exact;
      const sum = participants.reduce(
        (acc, p) => acc + (parseFloat(exactAmounts[p.id] ?? "0") || 0),
        0,
      );
      if (Math.abs(sum - total) > 0.01) {
        toast({
          title: `Exact amounts must sum to ${formatCurrency(total)}`,
          variant: "destructive",
        });
        return;
      }
      splits = participants.map((p) => ({
        userId: p.id,
        amount: parseFloat(exactAmounts[p.id] ?? "0") || 0,
      }));
    }

    const successLabel =
      effectiveMode === "loan"
        ? `Logged loan to ${friendsList[0]?.name ?? "friend"}`
        : isMulti
          ? `Expense added with ${friendsList.length} friends`
          : `Expense added with ${friendsList[0]?.name ?? "friend"}`;

    createExpense.mutate(
      {
        data: {
          friendUserIds: friendIds,
          description: description.trim(),
          category: category && category !== "General" ? category : null,
          totalAmount: total,
          currency: "USD",
          splitType: splitTypeForApi,
          paidByUserId: paidByForApi,
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
          toast({ title: successLabel });
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

  const titleSubtext = isMulti
    ? `${friendsList.length} friends`
    : friendsList[0]?.name ?? "friend";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Add expense with {titleSubtext}</DialogTitle>
          <DialogDescription>
            {isMulti
              ? `This expense isn't tied to a group — split equally between you and ${friendsList.length} friends.`
              : `This expense isn't tied to a group — just between you and ${friendsList[0]?.name ?? "your friend"}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Friends</Label>
            <div className="flex flex-wrap gap-2 items-center">
              {friendsList.map((f) => (
                <span
                  key={String(f.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 pl-3 pr-1 py-1 text-sm"
                >
                  <span className="truncate max-w-[140px]">{f.name}</span>
                  {friendsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeFriend(f.id)}
                      className="rounded-full p-0.5 hover:bg-muted"
                      aria-label={`Remove ${f.name}`}
                      title={`Remove ${f.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3"
                    disabled={
                      allFriendsQuery.isLoading || availableFriends.length === 0
                    }
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {availableFriends.length === 0
                      ? "No more friends"
                      : "Add friend"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="max-h-64 overflow-y-auto">
                    {availableFriends.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2 text-center">
                        Everyone's already added.
                      </p>
                    ) : (
                      availableFriends.map((f) => (
                        <button
                          key={String(f.id)}
                          type="button"
                          onClick={() => {
                            addFriend(f);
                            setPickerOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md text-left text-sm"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                            {f.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate">{f.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {f.email}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="Dinner, Movie, Cab…"
              value={description}
              onChange={(e) => {
                const v = e.target.value;
                setDescription(v);
                if (category === "General") {
                  const guess = guessCategory(v);
                  if (guess) setCategory(guess);
                }
              }}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => {
                    const Icon = getCategoryIcon(c);
                    return (
                      <SelectItem key={c} value={c}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          {c}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select
                value={paidByUserId}
                onValueChange={setPaidByUserId}
                disabled={mode === "loan"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Split</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">
                    Equally ({participants.length} ways)
                  </SelectItem>
                  {!isMulti && (
                    <SelectItem value="exact">Exact amounts</SelectItem>
                  )}
                  {!isMulti && (
                    <SelectItem value="loan">
                      Lent full amount to {friendsList[0]?.name ?? "friend"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isMulti && (
            <p className="text-xs text-muted-foreground">
              Multi-friend expenses always split equally.
            </p>
          )}

          {mode === "loan" && !isMulti && (
            <p className="text-xs text-muted-foreground">
              You paid the full amount. {friendsList[0]?.name ?? "Your friend"} owes
              you the entire {amount ? formatCurrency(parseFloat(amount) || 0) : "amount"}.
            </p>
          )}

          {mode === "exact" && (
            <div className="space-y-2">
              <Label>Exact amounts</Label>
              <div className="border rounded-md divide-y">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <span className="flex-1 text-sm truncate">{p.name}</span>
                    <Input
                      className="w-28"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={exactAmounts[p.id] ?? ""}
                      onChange={(e) => updateExactAmount(p.id, e.target.value)}
                    />
                  </div>
                ))}
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
