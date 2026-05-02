import { useEffect, useState } from "react";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createExpense = useCreateFriendExpense();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [myAmount, setMyAmount] = useState("");
  const [friendAmount, setFriendAmount] = useState("");

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
              <Select value={paidByUserId} onValueChange={setPaidByUserId}>
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
