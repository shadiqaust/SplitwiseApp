import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  useIncludeMemberInPastExpenses,
  useListExpenses,
  useListPayments,
  useUpdateGroup,
  type GroupMember,
} from "@workspace/api-client-react";
import { Plus, UserPlus, HandCoins, Receipt, Search, Check, Camera, Upload, Crown, ArrowLeftRight } from "lucide-react";

import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

function MemberAvatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-accent text-accent-foreground font-medium flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Group avatar presets ─────────────────────────────────────────────────────
const GROUP_PRESETS = [
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=alpha&size=200", label: "Alpha" },
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=beta&size=200", label: "Beta" },
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=gamma&size=200", label: "Gamma" },
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=delta&size=200", label: "Delta" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=hike&size=200", label: "Hike" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=trip&size=200", label: "Trip" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=squad&size=200", label: "Squad" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=crew&size=200", label: "Crew" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=house&size=200", label: "House" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=flat&size=200", label: "Flat" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=family&size=200", label: "Family" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=work&size=200", label: "Work" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=voyage&size=200", label: "Voyage" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=explorer&size=200", label: "Explorer" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=nomad&size=200", label: "Nomad" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=trailblazer&size=200", label: "Trailblazer" },
];

function compressGroupImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 200;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

function GroupAvatarDialog({
  groupId,
  currentUrl,
  groupName,
}: {
  groupId: string;
  currentUrl?: string | null;
  groupName: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const updateGroup = useUpdateGroup();

  const initials = getInitials(groupName);
  const previewUrl = selectedUrl ?? currentUrl ?? null;

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressGroupImage(file);
      setSelectedUrl(dataUrl);
    } catch {
      toast({ title: "Could not read image", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [toast]);

  const handleSave = useCallback(() => {
    if (!selectedUrl) return;
    setSaving(true);
    updateGroup.mutate(
      { groupId, data: { avatarUrl: selectedUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
          queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          toast({ title: "Group photo updated!" });
          setOpen(false);
          setSelectedUrl(null);
          setSaving(false);
        },
        onError: () => {
          toast({ title: "Failed to save group photo", variant: "destructive" });
          setSaving(false);
        },
      },
    );
  }, [selectedUrl, updateGroup, groupId, toast]);

  return (
    <>
      <div
        className="relative group cursor-pointer flex-shrink-0"
        onClick={() => setOpen(true)}
        title="Change group photo"
      >
        {previewUrl ? (
          <img
            src={currentUrl ?? previewUrl}
            alt={groupName}
            className="w-16 h-16 rounded-2xl object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
            {initials}
          </div>
        )}
        <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="w-5 h-5 text-white" />
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSelectedUrl(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Group photo</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 py-2">
            {(selectedUrl ?? currentUrl) ? (
              <img src={selectedUrl ?? currentUrl!} alt={groupName} className="w-14 h-14 rounded-xl object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                {initials}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {selectedUrl ? "New photo selected — tap Save to apply." : "Select a preset or upload a custom image."}
            </p>
          </div>

          <Tabs defaultValue="presets">
            <TabsList className="w-full">
              <TabsTrigger value="presets" className="flex-1">Preset icons</TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">Upload photo</TabsTrigger>
            </TabsList>

            <TabsContent value="presets">
              <div className="grid grid-cols-4 gap-3 py-3 max-h-72 overflow-y-auto">
                {GROUP_PRESETS.map((p) => {
                  const isSelected = selectedUrl === p.url || (!selectedUrl && currentUrl === p.url);
                  return (
                    <button
                      key={p.url}
                      onClick={() => setSelectedUrl(p.url)}
                      className={cn(
                        "relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none",
                        isSelected ? "border-primary shadow-md" : "border-transparent",
                      )}
                    >
                      <img src={p.url} alt={p.label} className="w-full aspect-square object-cover" />
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="upload">
              <div className="py-4">
                <div
                  className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    Click to upload a photo
                    <br />
                    <span className="text-xs">JPG, PNG — max 5 MB</span>
                  </p>
                  {uploading && <p className="text-xs text-primary">Processing…</p>}
                  {selectedUrl?.startsWith("data:") && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <Check className="w-3 h-3" /> Photo ready
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => { setOpen(false); setSelectedUrl(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={!selectedUrl || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function invalidateGroupData(groupId: string) {
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
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isFriend: boolean;
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

function AddMemberDialog({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [confirmMember, setConfirmMember] = useState<{ userId: string; name: string } | null>(null);
  const { toast } = useToast();
  const addMember = useAddGroupMember();
  const includeInPast = useIncludeMemberInPastExpenses();

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
    refetchInterval: false, // search dialog — don't poll
    staleTime: 0,
  });

  const handleAdd = useCallback((user: UserResult) => {
    setAddingId(user.id);
    addMember.mutate(
      { groupId, data: { userId: user.id } },
      {
        onSuccess: () => {
          invalidateGroupData(groupId);
          toast({
            title: `${user.name} added to group`,
            description: user.isFriend ? undefined : "Also added as a friend.",
          });
          setOpen(false);
          setSearch("");
          setAddingId(null);
          setConfirmMember({ userId: user.id, name: user.name });
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

  const handleConfirmInclude = useCallback(() => {
    if (!confirmMember) return;
    const { userId, name } = confirmMember;
    includeInPast.mutate(
      { groupId, data: { userId } },
      {
        onSuccess: (result) => {
          invalidateGroupData(groupId);
          if (result.updatedCount === 0 && result.totalCount === 0) {
            toast({ title: "No past expenses to update" });
          } else if (result.updatedCount === 0) {
            toast({
              title: "Nothing to update",
              description: `All ${result.totalCount} expense(s) use exact or percentage splits and were left unchanged.`,
            });
          } else {
            const skipNote = result.skippedNonEqualCount > 0
              ? ` (${result.skippedNonEqualCount} exact/percentage split(s) left unchanged)`
              : "";
            toast({
              title: `${name} added to ${result.updatedCount} past expense(s)`,
              description: `Balances have been recalculated${skipNote}.`,
            });
          }
          setConfirmMember(null);
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to update past expenses",
            description: getErrorMessage(err),
            variant: "destructive",
          });
          setConfirmMember(null);
        },
      },
    );
  }, [confirmMember, groupId, includeInPast, toast]);

  return (
    <>
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
            Your friends are listed below. Search by email to also find and add someone new — they'll be added as a friend automatically.
          </DialogDescription>
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
            <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
          )}
          {!isFetching && users.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {search
                ? "No match found. Try a full email address to find someone new."
                : "All your friends are already in this group."}
            </div>
          )}
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
              <UserAvatar name={user.name} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  {!user.isFriend && (
                    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      New friend
                    </span>
                  )}
                </div>
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

    <AlertDialog
      open={confirmMember !== null}
      onOpenChange={(o) => { if (!o) setConfirmMember(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Include {confirmMember?.name} in past expenses?</AlertDialogTitle>
          <AlertDialogDescription>
            This will re-split every existing equal-split expense in this group to include {confirmMember?.name}, and recalculate balances.
            Expenses with exact or percentage splits will be left unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={includeInPast.isPending}>No, only future expenses</AlertDialogCancel>
          <AlertDialogAction
            disabled={includeInPast.isPending}
            onClick={(e) => { e.preventDefault(); handleConfirmInclude(); }}
          >
            {includeInPast.isPending ? "Updating…" : "Yes, re-split past expenses"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function AddExpenseDialog({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [participantIds, setParticipantIds] = useState<Set<string>>(
    new Set(members.map((m) => m.userId)),
  );
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const createExpense = useCreateExpense();

  useEffect(() => {
    if (open) {
      setDescription("");
      setCategory("General");
      setAmount("");
      setPaidByUserId(currentUserId);
      setSplitType(SplitType.equal);
      setParticipantIds(new Set(members.map((m) => m.userId)));
      setExactAmounts({});
      setPercentages({});
    }
  }, [open, currentUserId, members]);

  const toggleParticipant = (userId: string) => {
    const next = new Set(participantIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setParticipantIds(next);
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
          category: category && category !== "General" ? category : null,
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
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select
                value={String(paidByUserId)}
                onValueChange={(v) => setPaidByUserId(v)}
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

type Balance = { fromUserId: string; toUserId: string; amount: number; fromUser: { name: string }; toUser: { name: string } };

function SettleUpDialog({
  groupId,
  members,
  currentUserId,
  balances,
}: {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  balances: Balance[];
}) {
  const [open, setOpen] = useState(false);
  const [fromUserId, setFromUserId] = useState<string>(currentUserId);
  const [toUserId, setToUserId] = useState<string | null>(null);
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

  const balanceHint = useMemo(() => {
    if (!toUserId || fromUserId === toUserId) return null;
    const owes = balances.find((b) => b.fromUserId === fromUserId && b.toUserId === toUserId);
    const owed = balances.find((b) => b.fromUserId === toUserId && b.toUserId === fromUserId);
    const fromName = fromUserId === currentUserId ? "You" : members.find((m) => m.userId === fromUserId)?.user.name ?? "Payer";
    const toName = toUserId === currentUserId ? "you" : members.find((m) => m.userId === toUserId)?.user.name ?? "Recipient";
    if (owes) return { text: `${fromName} owe${fromUserId !== currentUserId ? "s" : ""} ${toName} ${formatCurrency(owes.amount)}`, amount: owes.amount, positive: true };
    if (owed) return { text: `${toUserId === currentUserId ? "You owe" : `${owed.fromUser.name} owes`} ${fromUserId === currentUserId ? "you" : owed.toUser.name} ${formatCurrency(owed.amount)} — no payment needed`, amount: null, positive: false };
    return { text: "All settled up between these two", amount: null, positive: false };
  }, [fromUserId, toUserId, balances, currentUserId, members]);

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
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>From</Label>
              <Select
                value={String(fromUserId)}
                onValueChange={(v) => setFromUserId(v)}
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
            <button
              type="button"
              className="mb-px p-2 rounded-md border hover:bg-muted transition-colors"
              onClick={() => { const tmp = fromUserId; setFromUserId(toUserId ?? currentUserId); setToUserId(tmp); }}
              title="Swap"
            >
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex-1 space-y-2">
              <Label>To</Label>
              <Select
                value={toUserId !== null ? String(toUserId) : ""}
                onValueChange={(v) => setToUserId(v)}
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

          {balanceHint && (
            <div className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm",
              balanceHint.positive
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-muted border-border text-muted-foreground"
            )}>
              <span className="flex-1">{balanceHint.text}</span>
              {balanceHint.amount !== null && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={() => setAmount(balanceHint.amount!.toFixed(2))}
                >
                  Use amount
                </Button>
              )}
            </div>
          )}

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

type ProfileMember = { userId: string; user: { name: string; email: string; avatarUrl: string | null } };

function MemberProfileDialog({
  member,
  open,
  onOpenChange,
  groupId,
  myUserId,
  balances,
  members,
}: {
  member: ProfileMember;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  myUserId: string;
  balances: Balance[];
  members: GroupMember[];
}) {
  const owesMe = balances.find(b => b.fromUserId === member.userId && b.toUserId === myUserId);
  const iOwe = balances.find(b => b.fromUserId === myUserId && b.toUserId === member.userId);
  const netAmount = owesMe ? owesMe.amount : iOwe ? -iOwe.amount : 0;

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [settling, setSettling] = useState(false);
  const { toast } = useToast();
  const createPayment = useCreatePayment();

  useEffect(() => {
    if (open) { setAmount(""); setNote(""); setSettling(false); }
  }, [open]);

  const onSettle = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!value || value <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    const fromUserId = netAmount < 0 ? myUserId : member.userId;
    const toUserId = netAmount < 0 ? member.userId : myUserId;
    createPayment.mutate(
      { groupId, data: { fromUserId, toUserId, amount: value, note: note.trim() || null, date: new Date().toISOString().slice(0, 10) } },
      {
        onSuccess: () => {
          invalidateGroupData(groupId);
          toast({ title: "Payment recorded" });
          onOpenChange(false);
        },
        onError: (err: unknown) => toast({ title: "Failed", description: getErrorMessage(err), variant: "destructive" }),
      },
    );
  };

  const firstName = member.user.name.split(" ")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Member profile</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative">
            <MemberAvatar name={member.user.name} url={member.user.avatarUrl} size={72} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-lg">{member.user.name}</p>
            <p className="text-sm text-muted-foreground">{member.user.email}</p>
          </div>
          <div className={cn(
            "w-full rounded-xl p-4 text-center",
            netAmount === 0 ? "bg-muted" : netAmount > 0 ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"
          )}>
            {netAmount === 0 ? (
              <>
                <p className="font-semibold text-base">All settled up</p>
                <p className="text-sm text-muted-foreground">No balance with {firstName}</p>
              </>
            ) : netAmount > 0 ? (
              <>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(netAmount)}</p>
                <p className="text-sm text-muted-foreground">{firstName} owes you</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(Math.abs(netAmount))}</p>
                <p className="text-sm text-muted-foreground">You owe {firstName}</p>
              </>
            )}
          </div>
        </div>
        {!settling ? (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setSettling(true)}>
              <HandCoins className="w-4 h-4 mr-2" /> Settle up
            </Button>
          </div>
        ) : (
          <form onSubmit={onSettle} className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">
              {netAmount >= 0
                ? `Record payment from ${firstName} to you`
                : `Record payment from you to ${firstName}`}
            </p>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
              />
              {netAmount !== 0 && (
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setAmount(String(Math.abs(netAmount)))}
                >
                  Use balance ({formatCurrency(Math.abs(netAmount))})
                </button>
              )}
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input placeholder="e.g. Cash payment" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setSettling(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createPayment.isPending}>
                {createPayment.isPending ? "Saving..." : "Record payment"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function GroupDetailPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId!;

  // Polling cadence + background-polling are configured globally on the
  // QueryClient (5s, even when the tab is unfocused).
  const me = useGetMe();
  const group = useGetGroup(groupId);
  const expenses = useListExpenses(groupId);
  const payments = useListPayments(groupId);
  const balances = useGetGroupBalances(groupId);

  const myUserId = me.data?.id ?? "";
  const members = group.data?.members ?? [];

  const [filterMemberId, setFilterMemberId] = useState<string | "all">("all");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "7d" | "30d">("all");
  const [profileMember, setProfileMember] = useState<ProfileMember | null>(null);

  const totalGroupSpend = useMemo(
    () => (expenses.data ?? []).reduce((sum, e) => sum + e.totalAmount, 0),
    [expenses.data],
  );

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

  const filteredCombined = useMemo(() => {
    let items = combined;
    if (filterPeriod !== "all") {
      const days = filterPeriod === "7d" ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      items = items.filter((item) => {
        const d = item.date instanceof Date ? item.date : new Date(item.date as string);
        return d >= cutoff;
      });
    }
    if (filterMemberId !== "all") {
      items = items.filter((item) => {
        if (item.kind === "expense") {
          return item.data.paidByUserId === filterMemberId;
        }
        return item.data.fromUserId === filterMemberId || item.data.toUserId === filterMemberId;
      });
    }
    return items;
  }, [combined, filterMemberId, filterPeriod]);

  if (group.isError) {
    return <NotFound />;
  }

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
          <div className="flex items-start gap-4">
            <GroupAvatarDialog
              groupId={groupId}
              currentUrl={group.data.avatarUrl}
              groupName={group.data.name}
            />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {group.data.name}
              </h1>
              {group.data.description ? (
                <p className="text-muted-foreground mt-1">{group.data.description}</p>
              ) : null}
              {(() => {
                const creator = members.find((m) => m.userId === group.data?.createdByUserId);
                if (!creator) return null;
                const isMe = creator.userId === myUserId;
                return (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    Created by{" "}
                    <span className="font-medium">{isMe ? "you" : creator.user.name}</span>
                  </p>
                );
              })()}
            </div>
          </div>
          <div className="flex gap-2">
            {me.data ? (
              <>
                <SettleUpDialog
                  groupId={groupId}
                  members={members}
                  currentUserId={myUserId}
                  balances={balances.data ?? []}
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
              {members.map((m) => {
                const isMe = m.userId === myUserId;
                const avatarEl = (
                  <div className="relative">
                    <MemberAvatar name={m.user.name} url={m.user.avatarUrl} />
                    {m.userId === group.data?.createdByUserId && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-400 rounded-full p-0.5 border-2 border-background flex items-center justify-center">
                        <Crown className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </div>
                );
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    {isMe ? avatarEl : (
                      <button
                        type="button"
                        onClick={() => setProfileMember(m)}
                        className="rounded-full ring-2 ring-transparent hover:ring-primary transition-all"
                        title={`View ${m.user.name}'s profile`}
                      >
                        {avatarEl}
                      </button>
                    )}
                    <span className="text-sm">{isMe ? "You" : m.user.name}</span>
                  </div>
                );
              })}
              <AddMemberDialog groupId={groupId} />
            </div>
            {profileMember && (
              <MemberProfileDialog
                member={profileMember}
                open={!!profileMember}
                onOpenChange={(v) => { if (!v) setProfileMember(null); }}
                groupId={groupId}
                myUserId={myUserId}
                balances={balances.data ?? []}
                members={members}
              />
            )}
          </CardContent>
        </Card>

        {/* Total spend stat */}
        <Card>
          <CardContent className="py-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total group spend</span>
            <span className="text-lg font-bold">{formatCurrency(totalGroupSpend)}</span>
          </CardContent>
        </Card>

        <Tabs defaultValue="activity">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={filterMemberId} onValueChange={(v) => setFilterMemberId(v)}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="All members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={String(m.userId)}>
                      {m.userId === myUserId ? "You" : m.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as typeof filterPeriod)}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              {(filterMemberId !== "all" || filterPeriod !== "all") && (
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => { setFilterMemberId("all"); setFilterPeriod("all"); }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {filteredCombined.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  {filterMemberId !== "all" || filterPeriod !== "all"
                    ? "No activity matches the current filters."
                    : "No expenses yet. Add your first one."}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
              {filteredCombined.map((item) => {
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
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
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
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <HandCoins className="w-5 h-5 text-green-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {fromYou ? "You" : p.fromUser.name} settled with{" "}
                          {toYou ? "you" : p.toUser.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.date)}
                          {p.note ? ` · ${p.note}` : ""}
                        </p>
                      </div>
                      <div className="font-medium text-sm whitespace-nowrap text-green-700">
                        {formatCurrency(p.amount)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              </div>
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
