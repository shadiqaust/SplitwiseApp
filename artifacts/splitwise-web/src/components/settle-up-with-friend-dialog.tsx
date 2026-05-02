import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  useCreateNonGroupPayment,
} from "@workspace/api-client-react";
import { ArrowLeftRight, HandCoins } from "lucide-react";

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
import { formatCurrency } from "@/lib/format";

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
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  friend: SettleFriend;
  currentUserId: string;
  /** Positive: friend owes you. Negative: you owe friend. */
  netBalance?: number;
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

  // direction: "youPaid" → I paid friend (clears me-owes-friend balance)
  //            "friendPaid" → friend paid me (clears friend-owes-me balance)
  const defaultDirection: "youPaid" | "friendPaid" =
    typeof netBalance === "number" && netBalance > 0 ? "friendPaid" : "youPaid";
  const [direction, setDirection] = useState<"youPaid" | "friendPaid">(
    defaultDirection,
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (isOpen) {
      const dir: "youPaid" | "friendPaid" =
        typeof netBalance === "number" && netBalance > 0
          ? "friendPaid"
          : "youPaid";
      setDirection(dir);
      setAmount(
        typeof netBalance === "number" && Math.abs(netBalance) > 0.005
          ? Math.abs(netBalance).toFixed(2)
          : "",
      );
      setNote("");
    }
  }, [isOpen, netBalance]);

  const fromUserId = direction === "youPaid" ? currentUserId : friendId;
  const toUserId = direction === "youPaid" ? friendId : currentUserId;

  const hint =
    typeof netBalance === "number" && Math.abs(netBalance) > 0.005
      ? netBalance > 0
        ? `${friend.name} owes you ${formatCurrency(netBalance)}`
        : `You owe ${friend.name} ${formatCurrency(Math.abs(netBalance))}`
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
            <Label>Amount</Label>
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
      </DialogContent>
    </Dialog>
  );
}
