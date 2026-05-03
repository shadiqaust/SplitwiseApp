import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  SplitType,
  useCreateFriendExpense,
  useGetMe,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";
import { getCategoryIcon, guessCategory } from "@/lib/expense-categories";
import { UserAvatar } from "@/components/ui/user-avatar";

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
  avatarUrl?: string | null;
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
  const friendIds = useMemo(() => friends.map((f) => String(f.id)), [friends]);
  const isPair = friends.length === 1;
  const primaryFriend = friends[0];

  // Participants: me + selected friends. "You" is always first.
  const participants = useMemo(
    () => [
      { id: currentUserId, name: "You", isMe: true, avatarUrl: null as string | null },
      ...friends.map((f) => ({
        id: String(f.id),
        name: f.name,
        isMe: false,
        avatarUrl: f.avatarUrl ?? null,
      })),
    ],
    [currentUserId, friends],
  );

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createExpense = useCreateFriendExpense();
  const { data: me } = useGetMe();
  const defaultCurrency = me?.defaultCurrency ?? "USD";

  // UI-only split mode. "loan" only available in 1:1 mode.
  type Mode = "equal" | "exact" | "loan";

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>(currentUserId);
  const [mode, setMode] = useState<Mode>("equal");
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDescription("");
      setCategory("General");
      setAmount("");
      setPaidByUserId(currentUserId);
      setMode("equal");
      setExactAmounts({});
    }
  }, [open, currentUserId]);

  // In loan mode (1:1 only), the lender = whoever paid.
  const lenderIsMe = paidByUserId === currentUserId;
  const borrowerName = isPair ? (lenderIsMe ? primaryFriend.name : "you") : "";
  const lenderName = isPair ? (lenderIsMe ? "You" : primaryFriend.name) : "";

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

  const titleText = isPair
    ? `Add expense with ${primaryFriend.name}`
    : `Add expense with ${friends.length} friends`;
  const descriptionText = isPair
    ? `This expense isn't tied to a group — just between you and ${primaryFriend.name}.`
    : `Splitting equally between you and ${friends.length} friend${friends.length > 1 ? "s" : ""}. Not tied to a group.`;

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
    let splitTypeForApi: SplitType;
    const paidByForApi = paidByUserId;
    // "loan" is only valid 1:1; for multi-friend, fall back to equal.
    const effectiveMode: Mode = !isPair && mode === "loan" ? "equal" : mode;

    if (effectiveMode === "equal") {
      splitTypeForApi = SplitType.equal;
      splits = computeEqualSplits(total);
    } else if (effectiveMode === "loan") {
      // 1:1 only. Payer lent the full amount → payer owes 0, the other owes 100%.
      splitTypeForApi = SplitType.exact;
      const borrowerId =
        paidByUserId === currentUserId ? friendIds[0] : currentUserId;
      splits = [
        { userId: paidByUserId, amount: 0 },
        { userId: borrowerId, amount: total },
      ];
    } else {
      splitTypeForApi = SplitType.exact;
      const sum = participants.reduce(
        (acc, p) => acc + (parseFloat(exactAmounts[p.id] ?? "0") || 0),
        0,
      );
      if (Math.abs(sum - total) > 0.01) {
        toast({
          title: `Exact amounts must sum to ${formatCurrency(total, defaultCurrency)}`,
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
        ? lenderIsMe
          ? `Logged loan to ${primaryFriend.name}`
          : `Logged loan from ${primaryFriend.name}`
        : isPair
          ? `Expense added with ${primaryFriend.name}`
          : `Expense added with ${friends.length} friends`;

    createExpense.mutate(
      {
        data: {
          friendUserIds: friendIds,
          description: description.trim(),
          category: category && category !== "General" ? category : null,
          totalAmount: total,
          currency: defaultCurrency,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
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
              <Label>Amount ({getCurrencySymbol(defaultCurrency)})</Label>
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
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <UserAvatar name={p.name} url={p.avatarUrl} size={20} />
                        {p.name}
                      </span>
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
                    {isPair ? "Equally (2 ways)" : `Equally (${participants.length} ways)`}
                  </SelectItem>
                  <SelectItem value="exact">Exact amounts</SelectItem>
                  {isPair && (
                    <SelectItem value="loan">
                      {lenderIsMe
                        ? `Lent full amount to ${primaryFriend.name}`
                        : `${primaryFriend.name} lent full amount to you`}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isPair && mode === "loan" && (
            <p className="text-xs text-muted-foreground">
              {lenderName} paid the full amount. {borrowerName}{" "}
              {lenderIsMe ? "owes you" : "owe"} the entire{" "}
              {amount ? formatCurrency(parseFloat(amount) || 0, defaultCurrency) : "amount"}.
            </p>
          )}

          {(isPair ? mode === "exact" : mode === "exact") && (
            <div className="space-y-2">
              <Label>Exact amounts</Label>
              <div className="border rounded-md divide-y">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <UserAvatar name={p.name} url={p.avatarUrl} size={28} />
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
