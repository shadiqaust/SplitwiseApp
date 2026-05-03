import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getGetGroupQueryKey,
  getListExpensesQueryKey,
  getGetExpenseQueryKey,
  useGetExpense,
  useGetGroup,
  useGetMe,
  useUpdateExpense,
  SplitType,
} from "@workspace/api-client-react";
import { ArrowLeft, ImagePlus, Loader2, X } from "lucide-react";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";
import { photoSrc, uploadPhoto } from "@/lib/upload";

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

type Participant = { userId: string; name: string; avatarUrl: string | null };

export function ExpenseEditPage() {
  const params = useParams<{ expenseId: string }>();
  const expenseId = params.expenseId;
  const [, navigate] = useLocation();
  const me = useGetMe();
  const myId = me.data?.id;

  const expenseQ = useGetExpense(expenseId);
  const expense = expenseQ.data;
  const groupId = expense?.groupId ?? "";
  const groupQ = useGetGroup(groupId, {
    query: {
      queryKey: getGetGroupQueryKey(groupId),
      enabled: Boolean(expense?.groupId),
    },
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateExpense = useUpdateExpense();

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>("");
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [date, setDate] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(false);

  // Build the list of selectable participants:
  // - Group expenses: all current group members
  // - Non-group expenses: derived from existing splits + payer (people we know about)
  const participants = useMemo<Participant[]>(() => {
    if (!expense) return [];
    if (expense.groupId) {
      const members = groupQ.data?.members ?? [];
      return members.map((m) => ({
        userId: m.userId,
        name: m.user?.name ?? "Member",
        avatarUrl: m.user?.avatarUrl ?? null,
      }));
    }
    const seen = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const s of expense.splits) {
      seen.set(s.userId, {
        name: s.user?.name ?? "Member",
        avatarUrl: s.user?.avatarUrl ?? null,
      });
    }
    if (expense.paidByUser) {
      seen.set(expense.paidByUserId, {
        name: expense.paidByUser.name,
        avatarUrl: expense.paidByUser.avatarUrl ?? null,
      });
    }
    return Array.from(seen.entries()).map(([userId, v]) => ({
      userId,
      name: v.name,
      avatarUrl: v.avatarUrl,
    }));
  }, [expense, groupQ.data]);

  // One-shot hydration from server state
  useEffect(() => {
    if (hydrated || !expense) return;
    if (expense.groupId && !groupQ.data && !groupQ.isError) return;
    setDescription(expense.description);
    setCategory(expense.category && expense.category.trim() ? expense.category : "General");
    setAmount(String(expense.totalAmount));
    setPaidByUserId(expense.paidByUserId);
    setSplitType(expense.splitType as SplitType);
    setParticipantIds(new Set(expense.splits.map((s) => s.userId)));
    setExactAmounts(
      Object.fromEntries(
        expense.splits.map((s) => [s.userId, String(s.amount)]),
      ),
    );
    setPercentages(
      Object.fromEntries(
        expense.splits.map((s) => [
          s.userId,
          s.percentage != null ? String(s.percentage) : "",
        ]),
      ),
    );
    setDate(expense.date);
    setPhotoUrl(expense.photoUrl ?? null);
    setHydrated(true);
  }, [expense, groupQ.data, hydrated]);

  const toggleParticipant = (userId: string) => {
    if (userId === paidByUserId) return;
    const next = new Set(participantIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setParticipantIds(next);
  };

  const changePayer = (userId: string) => {
    setPaidByUserId(userId);
    setParticipantIds((prev) => {
      if (prev.has(userId)) return prev;
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  };

  const onPickPhoto = () => fileInputRef.current?.click();

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const objectPath = await uploadPhoto(file);
      setPhotoUrl(objectPath);
      toast({ title: "Receipt uploaded" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const buildSplits = (): Array<{
    userId: string;
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
    if (!expenseId || !expense) return;
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

    updateExpense.mutate(
      {
        expenseId,
        data: {
          description: description.trim(),
          category: category && category !== "General" ? category : null,
          totalAmount: total,
          splitType,
          paidByUserId,
          date,
          photoUrl,
          splits,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetExpenseQueryKey(expenseId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetActivityQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: ["non-group-expenses"] });
          queryClient.invalidateQueries({ queryKey: ["friend-activity"] });
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          if (expense.groupId) {
            queryClient.invalidateQueries({
              queryKey: getListExpensesQueryKey(expense.groupId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetGroupBalancesQueryKey(expense.groupId),
            });
          }
          toast({ title: "Expense updated" });
          navigate(`/expenses/${expenseId}`);
        },
        onError: (err) => {
          toast({
            title: "Failed to update expense",
            description: getErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  if (
    expenseQ.isLoading ||
    (expense?.groupId && (groupQ.isLoading || (!groupQ.data && !groupQ.isError))) ||
    (expense && !hydrated)
  ) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-72 w-full" />
        </div>
      </Layout>
    );
  }

  if (!expense) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto p-6 text-center space-y-4">
          <p className="text-muted-foreground">Expense not found.</p>
          <Link href="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const photoSrcUrl = photoSrc(photoUrl);
  const backHref = `/expenses/${expenseId}`;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <Link href={backHref}>
          <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to expense
          </a>
        </Link>

        <Card>
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold mb-4">Edit expense</h1>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDescription(v);
                    if (category === "General") {
                      const guess = guessCategory(v);
                      if (guess) setCategory(guess);
                    }
                  }}
                  placeholder="Dinner, Groceries..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount ({getCurrencySymbol()})</Label>
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
                      <SelectValue placeholder="Select category" />
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
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Paid by</Label>
                  <Select
                    value={paidByUserId}
                    onValueChange={changePayer}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payer" />
                    </SelectTrigger>
                    <SelectContent>
                      {participants.map((p) => (
                        <SelectItem key={p.userId} value={p.userId}>
                          <span className="inline-flex items-center gap-2">
                            <UserAvatar name={p.name} url={p.avatarUrl} size={20} />
                            {p.userId === myId ? "You" : p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

              <div className="space-y-2">
                <Label>Participants</Label>
                <div className="border rounded-md divide-y">
                  {participants.map((p) => {
                    const checked = participantIds.has(p.userId);
                    return (
                      <label
                        key={p.userId}
                        className="flex items-center gap-3 p-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParticipant(p.userId)}
                        />
                        <UserAvatar name={p.name} url={p.avatarUrl} size={28} />
                        <span className="flex-1 text-sm">
                          {p.userId === myId ? "You" : p.name}
                        </span>
                        {checked && splitType === SplitType.exact && (
                          <Input
                            className="w-24"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={exactAmounts[p.userId] ?? ""}
                            onChange={(e) =>
                              setExactAmounts((prev) => ({
                                ...prev,
                                [p.userId]: e.target.value,
                              }))
                            }
                          />
                        )}
                        {checked && splitType === SplitType.percentage && (
                          <Input
                            className="w-20"
                            type="number"
                            step="0.01"
                            placeholder="%"
                            value={percentages[p.userId] ?? ""}
                            onChange={(e) =>
                              setPercentages((prev) => ({
                                ...prev,
                                [p.userId]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Receipt photo (optional)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPhotoChange}
                  className="hidden"
                />
                {photoSrcUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={photoSrcUrl}
                      alt="Receipt"
                      className="rounded-lg border max-h-56 object-contain bg-muted"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="absolute top-1 right-1 bg-background/90 rounded-full p-1 border"
                      aria-label="Remove photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onPickPhoto}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ImagePlus className="w-4 h-4 mr-2" />
                    )}
                    {uploading ? "Uploading..." : "Add receipt photo"}
                  </Button>
                )}
                {photoSrcUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onPickPhoto}
                    disabled={uploading}
                    className="ml-2"
                  >
                    Replace
                  </Button>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(backHref)}
                  disabled={updateExpense.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateExpense.isPending || uploading}
                >
                  {updateExpense.isPending ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
