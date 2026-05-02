import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

export function AddExpenseWithFriendDialog({
  friend,
  currentUserId,
  open,
  onOpenChange,
}: {
  friend: FriendLike;
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const friendId = String(friend.id);

  // Participants: me + the single friend. "You" is always first.
  const participants = useMemo(
    () => [
      { id: currentUserId, name: "You", isMe: true },
      { id: friendId, name: friend.name, isMe: false },
    ],
    [currentUserId, friendId, friend.name],
  );

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createExpense = useCreateFriendExpense();

  // UI-only split mode. "loan" = lent the full amount to the friend.
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

  // In loan mode, the lender (you) is always the payer.
  useEffect(() => {
    if (mode === "loan" && paidByUserId !== currentUserId) {
      setPaidByUserId(currentUserId);
    }
  }, [mode, paidByUserId, currentUserId]);

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

    let splits: Array<{ userId: string; amount: number }> = [];
    let splitTypeForApi: SplitType;
    let paidByForApi = paidByUserId;
    if (mode === "equal") {
      splitTypeForApi = SplitType.equal;
      splits = computeEqualSplits(total);
    } else if (mode === "loan") {
      // I lent the full amount to the friend → I pay everything, friend owes 100%.
      splitTypeForApi = SplitType.exact;
      paidByForApi = currentUserId;
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
      mode === "loan"
        ? `Logged loan to ${friend.name}`
        : `Expense added with ${friend.name}`;

    createExpense.mutate(
      {
        data: {
          friendUserIds: [friendId],
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Add expense with {friend.name}</DialogTitle>
          <DialogDescription>
            This expense isn't tied to a group — just between you and{" "}
            {friend.name}.
          </DialogDescription>
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
                  <SelectItem value="equal">Equally (2 ways)</SelectItem>
                  <SelectItem value="exact">Exact amounts</SelectItem>
                  <SelectItem value="loan">
                    Lent full amount to {friend.name}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "loan" && (
            <p className="text-xs text-muted-foreground">
              You paid the full amount. {friend.name} owes you the entire{" "}
              {amount ? formatCurrency(parseFloat(amount) || 0) : "amount"}.
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
