import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/format";

interface Friend {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  netBalance: number;
  sharedGroups: { id: number; name: string }[];
}

function useAuthFetch() {
  return (url: string) => {
    const token = localStorage.getItem("sw_auth_token");
    return fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };
}

function FriendAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="w-11 h-11 rounded-full object-cover" />;
  }
  return (
    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

function BalanceBadge({ amount }: { amount: number }) {
  if (Math.abs(amount) < 0.01) {
    return <span className="text-sm text-muted-foreground">settled up</span>;
  }
  const isOwed = amount > 0;
  return (
    <div className={cn("text-right", isOwed ? "text-green-600" : "text-red-500")}>
      <p className="text-xs font-medium">{isOwed ? "owes you" : "you owe"}</p>
      <p className="text-base font-bold">{formatCurrency(Math.abs(amount))}</p>
    </div>
  );
}

export function FriendsPage() {
  const authFetch = useAuthFetch();

  const { data: friends, isLoading, isError } = useQuery<Friend[]>({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await authFetch("/api/friends");
      if (!res.ok) throw new Error("Failed to load friends");
      return res.json();
    },
    refetchInterval: 15_000,
    staleTime: 30_000,
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Friends</h1>
          <p className="text-muted-foreground text-sm mt-1">
            People you share groups with and your balance with each of them.
          </p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4 py-4">
                  <Skeleton className="w-11 h-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-10 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <p className="text-destructive text-sm">Failed to load friends. Please try again.</p>
        )}

        {!isLoading && friends?.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-1">No friends yet</p>
              <p className="text-sm">Add members to a group to see them here.</p>
            </CardContent>
          </Card>
        )}

        {friends && friends.length > 0 && (
          <div className="space-y-3">
            {friends.map((friend) => (
              <Card key={friend.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center gap-4 py-4">
                  <FriendAvatar name={friend.name} avatarUrl={friend.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{friend.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{friend.email}</p>
                    {friend.sharedGroups.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {friend.sharedGroups.map((g) => g.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <BalanceBadge amount={friend.netBalance} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
