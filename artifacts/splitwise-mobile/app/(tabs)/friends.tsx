import { useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useColors } from "@/hooks/useColors";
import { formatCurrency } from "@/lib/format";
import { authFetch } from "@/lib/api";
import { AddExpenseWithFriendModal } from "@/components/AddExpenseWithFriendModal";
import { SettleUpWithFriendModal } from "@/components/SettleUpWithFriendModal";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE_URL = domain ? `https://${domain}` : "";

interface Friend {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  netBalance: number;
  sharedGroups: { id: number; name: string }[];
  isDirect: boolean;
}

interface UserResult {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

// authFetch is provided by lib/api.ts (shared, with 401 → auto-logout).

function AddFriendModal({ existingIds, onClose }: { existingIds: Set<number>; onClose: () => void }) {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: users = [], isFetching } = useQuery<UserResult[]>({
    queryKey: ["user-search-mobile-friends", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await authFetch(`/api/users/search?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: false, // search input — don't poll
  });

  const addMutation = useMutation({
    mutationFn: async (friendId: number) => {
      const res = await authFetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends-mobile"] });
    },
  });

  return (
    <Modal animationType="slide" transparent presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add a Friend</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name or email…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>

        {isFetching && users.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : users.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {search ? "No users found." : "Start typing to search…"}
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            {users.map((user) => {
              const alreadyFriend = existingIds.has(user.id);
              const isPending = addMutation.isPending && addMutation.variables === user.id;
              return (
                <View key={user.id} style={[styles.userRow, { borderBottomColor: colors.border }]}>
                  <Avatar name={user.name} url={user.avatarUrl} size={40} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{user.name}</Text>
                    <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{user.email}</Text>
                  </View>
                  {alreadyFriend ? (
                    <Text style={[styles.friendLabel, { color: colors.mutedForeground }]}>Friends</Text>
                  ) : (
                    <Pressable
                      disabled={isPending}
                      onPress={() => addMutation.mutate(user.id)}
                      style={[styles.addBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.6 : 1 }]}
                    >
                      <Text style={styles.addBtnText}>{isPending ? "Adding…" : "Add"}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function FriendsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [expenseFriend, setExpenseFriend] = useState<Friend | null>(null);
  const [settleFriend, setSettleFriend] = useState<Friend | null>(null);
  const me = useGetMe();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: friends, isLoading, refetch } = useQuery<Friend[]>({
    queryKey: ["friends-mobile"],
    queryFn: async () => {
      const res = await authFetch("/api/friends");
      if (!res.ok) throw new Error("Failed to load friends");
      return res.json();
    },
    staleTime: 4_000,
    // refetchInterval / refetchIntervalInBackground inherited from QueryClient
    // defaults (5s polling, runs in background).
  });

  const onRefreshFriends = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const filtered = useMemo(() => {
    if (!friends) return [];
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q));
  }, [friends, search]);

  const existingIds = useMemo(() => new Set((friends ?? []).map((f) => f.id)), [friends]);

  if (isLoading && !friends) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefreshFriends} tintColor={colors.primary} />}
      >
        {/* Search + Add button */}
        <View style={styles.topRow}>
          <View style={[styles.searchRow, { flex: 1, backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search friends…"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <Pressable
            onPress={() => setShowAdd(true)}
            style={[styles.addFriendBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="user-plus" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Empty state */}
        {!isLoading && (friends ?? []).length === 0 && (
          <Card>
            <EmptyState icon="users" title="No friends yet" message='Tap "+" to add someone.' />
          </Card>
        )}

        {/* Search empty */}
        {!isLoading && (friends ?? []).length > 0 && filtered.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No friends match your search.</Text>
        )}

        {/* List */}
        {filtered.map((friend) => {
          const isOwed = friend.netBalance > 0;
          const isEven = Math.abs(friend.netBalance) < 0.01;
          return (
            <Pressable
              key={friend.id}
              onPress={() => router.push(`/friends/${friend.id}`)}
            >
              <Card style={styles.friendRow}>
                <Avatar name={friend.name} url={friend.avatarUrl} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{friend.name}</Text>
                  <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{friend.email}</Text>
                  {friend.sharedGroups.length > 0 && (
                    <Text style={[styles.groupsText, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {friend.sharedGroups.map((g) => g.name).join(", ")}
                    </Text>
                  )}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setExpenseFriend(friend);
                      }}
                      disabled={!me.data?.id}
                      style={({ pressed }) => [
                        styles.actionButton,
                        { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                      ]}
                      hitSlop={6}
                    >
                      <Feather name="plus" size={13} color={colors.primaryForeground} />
                      <Text style={[styles.actionButtonText, { color: colors.primaryForeground }]}>Add expense</Text>
                    </Pressable>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setSettleFriend(friend);
                      }}
                      disabled={!me.data?.id}
                      style={({ pressed }) => [
                        styles.actionButtonOutline,
                        { borderColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                      ]}
                      hitSlop={6}
                    >
                      <Feather name="check-circle" size={13} color={colors.primary} />
                      <Text style={[styles.actionButtonText, { color: colors.primary }]}>Settle up</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {isEven ? (
                    <Text style={[styles.evenText, { color: colors.mutedForeground }]}>settled</Text>
                  ) : (
                    <>
                      <Text style={[styles.balanceLabel, { color: isOwed ? colors.positive : colors.negative }]}>
                        {isOwed ? "owes you" : "you owe"}
                      </Text>
                      <Text style={[styles.balanceAmount, { color: isOwed ? colors.positive : colors.negative }]}>
                        {formatCurrency(Math.abs(friend.netBalance))}
                      </Text>
                    </>
                  )}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>

      {showAdd && <AddFriendModal existingIds={existingIds} onClose={() => setShowAdd(false)} />}
      {expenseFriend && me.data?.id && (
        <AddExpenseWithFriendModal
          friend={expenseFriend}
          currentUserId={me.data.id}
          onClose={() => setExpenseFriend(null)}
        />
      )}
      {settleFriend && me.data?.id && (
        <SettleUpWithFriendModal
          friend={settleFriend}
          currentUserId={me.data.id}
          netBalance={settleFriend.netBalance}
          onClose={() => setSettleFriend(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 12, paddingBottom: 80 },
  topRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  addFriendBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatar: { borderRadius: 100, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  friendRow: { flexDirection: "row", alignItems: "center" },
  userName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  userEmail: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  groupsText: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  balanceLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
  balanceAmount: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  evenText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  emptyText: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 32 },
  // Modal sheet styles
  sheet: { flex: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, marginTop: 60 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  friendLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  // Add-expense-with-friend modal
  addExpenseText: { fontFamily: "Inter_500Medium", fontSize: 12, marginLeft: 4 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  actionButtonOutline: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  actionButtonText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  choice: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  exactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  exactLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  exactInput: {
    width: 110,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "right",
  },
  submitBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  submitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
});
