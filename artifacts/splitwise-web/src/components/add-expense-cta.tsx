import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Check, UserPlus } from "lucide-react";
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
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/hooks/use-toast";
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

interface UserResult {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("sw_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AddExpenseCTA() {
  const me = useGetMe();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  // When the search has no matching friends, look up users by name/email so
  // the user can add a brand-new friend right from this picker.
  const friendIdSet = useMemo(
    () => new Set((friendsQuery.data ?? []).map((f) => String(f.id))),
    [friendsQuery.data],
  );
  const userSearchEnabled =
    pickerOpen && search.trim().length >= 2 && filtered.length === 0;

  const userSearch = useQuery<UserResult[]>({
    queryKey: ["user-search-add-expense", search.trim()],
    queryFn: async () => {
      const params = new URLSearchParams({ q: search.trim() });
      const res = await fetch(`/api/users/search?${params}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to search users");
      return res.json();
    },
    enabled: userSearchEnabled,
    staleTime: 0,
    refetchInterval: false,
  });

  const newPeople = useMemo(() => {
    if (!userSearchEnabled) return [];
    return (userSearch.data ?? []).filter(
      (u) => String(u.id) !== String(me.data?.id) && !friendIdSet.has(String(u.id)),
    );
  }, [userSearchEnabled, userSearch.data, friendIdSet, me.data?.id]);

  const addFriend = useMutation({
    mutationFn: async (user: UserResult) => {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: user.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add friend");
      }
      return user;
    },
    onSuccess: (user) => {
      toast({ title: `${user.name} added!` });
      // Optimistically merge the new friend into the cache so Continue works
      // immediately without waiting for the refetch.
      queryClient.setQueryData<ApiFriend[]>(["friends"], (prev) => {
        const list = prev ?? [];
        if (list.some((f) => String(f.id) === String(user.id))) return list;
        return [
          ...list,
          {
            id: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
          },
        ];
      });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(String(user.id));
        return next;
      });
      // Clear the search so the newly added friend appears in the friend list.
      setSearch("");
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't add friend",
        description: err.message,
        variant: "destructive",
      });
    },
  });

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
              Pick one or more friends — or search by email to add someone new.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends or email…"
                className="pl-9"
                autoFocus
                data-testid="picker-search"
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto -mx-2 pr-1">
              {friendsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Loading friends…
                </p>
              ) : filtered.length > 0 ? (
                filtered.map((f) => {
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
                      <UserAvatar name={f.name} url={f.avatarUrl} size={36} />
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
                })
              ) : (friendsQuery.data ?? []).length === 0 && !search ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Add some friends first to split expenses with them.
                </p>
              ) : null}

              {/* Non-friend search results */}
              {userSearchEnabled && (
                <div className="mt-2">
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Not your friend yet
                  </div>
                  {userSearch.isFetching && newPeople.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Searching…
                    </p>
                  ) : newPeople.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No users found for "{search}".
                    </p>
                  ) : (
                    newPeople.map((u) => {
                      const isPending =
                        addFriend.isPending &&
                        addFriend.variables?.id === u.id;
                      return (
                        <div
                          key={u.id}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md"
                          data-testid={`user-row-${u.id}`}
                        >
                          <UserAvatar name={u.name} url={u.avatarUrl} size={36} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {u.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {u.email}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isPending}
                            onClick={() => addFriend.mutate(u)}
                          >
                            <UserPlus className="w-3.5 h-3.5 mr-1" />
                            {isPending ? "Adding…" : "Add"}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
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
