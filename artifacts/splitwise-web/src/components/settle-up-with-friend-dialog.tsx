import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  useCreateNonGroupPayment,
  useGetMe,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowLeftRight, HandCoins, Receipt, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

export interface SettleFriend {
  id: string | number;
  name: string;
}

export function SettleUpWithFriendDialog({
  open,
  onOpenChange,
  friend,
  currentUserId,
  netBalance,
  balances,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  friend: SettleFriend;
  currentUserId: string;
  /** Positive: friend owes you. Negative: you owe friend. */
  netBalance?: number;
  /** Per-currency balances. Positive: friend owes you. Negative: you owe friend. */
  balances?: { currency: string; amount: number }[];
  trigger?: React.ReactNode;
}) {
  const isControlled = typeof open === "boolean";
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? (open as boolean) : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const friendId = String(friend.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPayment = useCreateNonGroupPayment();
  const { data: me } = useGetMe();
  const [, navigate] = useLocation();

  const defaultCurrency = me?.defaultCurrency ?? "USD";
  const nonZeroBalances = (balances ?? []).filter(
    (b) => Math.abs(b.amount) >= 0.01,
  );
  // Direct friend settle-up is recorded in the user's default currency.
  // Show the warning whenever any non-zero balance is in a different currency,
  // OR balances span multiple currencies — both cases can't be settled directly.
  const settleableBalance =
    nonZeroBalances.length === 1 &&
    nonZeroBalances[0].currency === defaultCurrency
      ? nonZeroBalances[0]
      : null;
  const needsCurrencyWarning =
    nonZeroBalances.length > 0 && settleableBalance === null;
  const currency = defaultCurrency;
  const effectiveNet = settleableBalance
    ? settleableBalance.amount
    : (netBalance ?? 0);

  // direction: "youPaid" → I paid friend (clears me-owes-friend balance)
  //            "friendPaid" → friend paid me (clears friend-owes-me balance)
  const defaultDirection: "youPaid" | "friendPaid" =
    effectiveNet > 0 ? "friendPaid" : "youPaid";
  const [direction, setDirection] = useState<"youPaid" | "friendPaid">(
    defaultDirection,
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (isOpen) {
      const dir: "youPaid" | "friendPaid" =
        effectiveNet > 0 ? "friendPaid" : "youPaid";
      setDirection(dir);
      setAmount(
        Math.abs(effectiveNet) > 0.005 ? Math.abs(effectiveNet).toFixed(2) : "",
      );
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, effectiveNet]);

  const fromUserId = direction === "youPaid" ? currentUserId : friendId;
  const toUserId = direction === "youPaid" ? friendId : currentUserId;

  const hint =
    Math.abs(effectiveNet) > 0.005
      ? effectiveNet > 0
        ? `${friend.name} owes you ${formatCurrency(effectiveNet, currency)}`
        : `You owe ${friend.name} ${formatCurrency(Math.abs(effectiveNet), currency)}`
      : "All settled up";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    createPayment.mutate(
      {
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
          toast({ title: "Payment recorded" });
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          queryClient.invalidateQueries({
            queryKey: ["friend-activity", friendId],
          });
          queryClient.invalidateQueries({ queryKey: ["non-group-expenses"] });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetActivityQueryKey(),
          });
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

  const swap = () =>
    setDirection((d) => (d === "youPaid" ? "friendPaid" : "youPaid"));

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <span onClick={() => setOpen(true)}>{trigger}</span> : null}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settle up with {friend.name}</DialogTitle>
        </DialogHeader>
        {needsCurrencyWarning ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-3 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  Can't settle this directly
                </p>
                <p className="text-amber-800 dark:text-amber-300/90">
                  {nonZeroBalances.length > 1
                    ? `Balances span multiple currencies. Direct friend settle-up only records ${defaultCurrency}.`
                    : `This balance is in ${nonZeroBalances[0]?.currency}, but direct friend settle-up only records ${defaultCurrency}.`}{" "}
                  Settle within the relevant group, or add a non-group expense
                  in that currency.
                </p>
                <ul className="space-y-0.5 pl-1">
                  {nonZeroBalances.map((b) => {
                    const owed = b.amount > 0;
                    return (
                      <li key={b.currency} className="text-xs">
                        <span className="font-medium">
                          {formatCurrency(Math.abs(b.amount), b.currency)}
                        </span>
                        <span className="text-amber-800/80 dark:text-amber-300/80">
                          {" "}
                          — {owed ? `${friend.name} owes you` : `you owe ${friend.name}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  navigate("/groups");
                }}
              >
                <Users className="w-4 h-4 mr-2" />
                Settle in a group
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  navigate("/non-group-expenses");
                }}
              >
                <Receipt className="w-4 h-4 mr-2" />
                Add non-group expense
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {hint}
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>From</Label>
              <Select
                value={direction}
                onValueChange={(v) =>
                  setDirection(v as "youPaid" | "friendPaid")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youPaid">You</SelectItem>
                  <SelectItem value="friendPaid">{friend.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={swap}
              className="mb-px p-2 rounded-md border hover:bg-muted transition-colors"
              title="Swap direction"
            >
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex-1 space-y-2">
              <Label>To</Label>
              <Select
                value={direction === "youPaid" ? "friend" : "you"}
                onValueChange={(v) =>
                  setDirection(v === "you" ? "friendPaid" : "youPaid")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="you">You</SelectItem>
                  <SelectItem value="friend">{friend.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Amount ({getCurrencySymbol(currency)})</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createPayment.isPending}>
              <HandCoins className="w-4 h-4 mr-2" />
              {createPayment.isPending ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
