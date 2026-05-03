import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Check } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";

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
import {
  AddExpenseWithFriendDialog,
  type FriendLike,
} from "./add-expense-with-friend-dialog";

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

export function AddExpenseCTA() {
  const me = useGetMe();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenFriends, setChosenFriends] = useState<FriendLike[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const friendsQuery = useQuery<ApiFriend[]>({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load friends");
      return res.json();
    },
    enabled: pickerOpen,
  });

  useEffect(() => {
    if (!pickerOpen) {
      setSearch("");
      setSelectedIds(new Set());
    }
  }, [pickerOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (friendsQuery.data ?? []).filter(
      (f) =>
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q),
    );
  }, [friendsQuery.data, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onContinue = () => {
    const all = friendsQuery.data ?? [];
    const picked = all
      .filter((f) => selectedIds.has(String(f.id)))
      .map<FriendLike>((f) => ({
        id: f.id,
        name: f.name,
        avatarUrl: f.avatarUrl ?? null,
      }));
    if (picked.length === 0) return;
    setChosenFriends(picked);
    setPickerOpen(false);
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => setPickerOpen(true)}
        disabled={!me.data?.id}
      >
        <Plus className="w-4 h-4 mr-1" />
        Add expense
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>
              Pick one or more friends to split a non-group expense with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends…"
                className="pl-9"
                autoFocus
              />
            </div>

            {friendsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Loading friends…
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {(friendsQuery.data ?? []).length === 0
                  ? "Add some friends first to split expenses with them."
                  : "No friends match your search."}
              </p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto -mx-2 pr-1">
                {filtered.map((f) => {
                  const id = String(f.id);
                  const checked = selectedIds.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted rounded-md text-left transition-colors"
                      onClick={() => toggle(id)}
                      data-testid={`friend-row-${id}`}
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                        {f.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {f.email}
                        </p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input"
                        }`}
                        aria-checked={checked}
                        role="checkbox"
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={onContinue}
              disabled={selectedIds.size === 0}
              data-testid="continue-add-expense"
            >
              {selectedIds.size === 0
                ? "Continue"
                : `Continue with ${selectedIds.size} ${selectedIds.size === 1 ? "friend" : "friends"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {chosenFriends && me.data?.id && (
        <AddExpenseWithFriendDialog
          friends={chosenFriends}
          currentUserId={me.data.id}
          open
          onOpenChange={(o) => {
            if (!o) setChosenFriends(null);
          }}
        />
      )}
    </>
  );
}
