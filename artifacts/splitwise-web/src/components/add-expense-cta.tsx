import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, FriendLike>>(new Map());

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
      setSelected(new Map());
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

  const onPickerChange = (o: boolean) => {
    setPickerOpen(o);
  };

  const toggleFriend = (f: ApiFriend) => {
    const key = String(f.id);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { id: f.id, name: f.name });
      return next;
    });
  };

  const onNext = () => {
    if (selected.size === 0) return;
    setChosenFriends(Array.from(selected.values()));
    setPickerOpen(false);
  };

  const selectedCount = selected.size;

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

      <Dialog open={pickerOpen} onOpenChange={onPickerChange}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>
              Select one or more friends to split a non-group expense with.
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
                  const key = String(f.id);
                  const isSelected = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted rounded-md text-left transition-colors"
                      onClick={() => toggleFriend(f)}
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
                        className={cn(
                          "w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-border bg-transparent",
                        )}
                      >
                        {isSelected && (
                          <Check className="w-3 h-3 text-primary-foreground" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPickerOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onNext}
              disabled={selectedCount === 0}
            >
              {selectedCount > 0 ? `Next (${selectedCount})` : "Next"}
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
