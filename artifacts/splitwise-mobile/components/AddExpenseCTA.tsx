import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { useColors } from "@/hooks/useColors";
import { authFetch } from "@/lib/api";
import {
  AddExpenseWithFriendModal,
  type FriendLike,
} from "./AddExpenseWithFriendModal";

interface ApiFriend {
  id: string | number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface UserResult {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export function AddExpenseCTA() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const me = useGetMe();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenFriends, setChosenFriends] = useState<FriendLike[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const friendsQuery = useQuery<ApiFriend[]>({
    queryKey: ["friends-mobile"],
    queryFn: async () => {
      const res = await authFetch("/api/friends");
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
    return (friendsQuery.data ?? []).filter((f) => {
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q)
      );
    });
  }, [friendsQuery.data, search]);

  // When the search yields no friend matches, look up users by name/email
  // so the user can add a brand-new friend right from this picker.
  const friendIdSet = useMemo(
    () => new Set((friendsQuery.data ?? []).map((f) => String(f.id))),
    [friendsQuery.data],
  );
  const userSearchEnabled =
    pickerOpen && search.trim().length >= 2 && filtered.length === 0;

  const userSearch = useQuery<UserResult[]>({
    queryKey: ["user-search-add-expense-mobile", search.trim()],
    queryFn: async () => {
      const params = new URLSearchParams({ q: search.trim() });
      const res = await authFetch(`/api/users/search?${params}`);
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
      const res = await authFetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: user.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add friend");
      }
      return user;
    },
    onSuccess: (user) => {
      // Optimistically merge into cache so Continue works without waiting
      // for the refetch.
      queryClient.setQueryData<ApiFriend[]>(["friends-mobile"], (prev) => {
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
      queryClient.invalidateQueries({ queryKey: ["friends-mobile"] });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(String(user.id));
        return next;
      });
      setSearch("");
    },
    onError: (err: Error) => {
      Alert.alert("Couldn't add friend", err.message);
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

  const closePicker = () => setPickerOpen(false);

  return (
    <>
      <Pressable
        onPress={() => setPickerOpen(true)}
        disabled={!me.data?.id}
        style={({ pressed }) => [
          styles.ctaBtn,
          {
            backgroundColor: colors.primary,
            opacity: !me.data?.id ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Feather name="plus" size={18} color="#fff" />
        <Text style={styles.ctaBtnText}>Add expense</Text>
      </Pressable>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePicker}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 8) },
          ]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={closePicker} hitSlop={12} style={styles.headerSide}>
              <Text style={[styles.headerCancel, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                Add expense
              </Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
                Pick friends or search by email
              </Text>
            </View>
            <Pressable
              onPress={onContinue}
              disabled={selectedIds.size === 0}
              hitSlop={12}
              style={styles.headerSide}
            >
              <Text
                style={[
                  styles.headerSave,
                  {
                    color: selectedIds.size === 0 ? colors.mutedForeground : colors.primary,
                    textAlign: "right",
                  },
                ]}
              >
                Next
              </Text>
            </Pressable>
          </View>

          <View style={{ padding: 16, gap: 12, flex: 1 }}>
            <View
              style={[
                styles.searchWrap,
                { backgroundColor: colors.muted, borderColor: colors.border },
              ]}
            >
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search friends or email…"
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {friendsQuery.isLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : filtered.length > 0 ? (
                filtered.map((f) => {
                  const id = String(f.id);
                  const checked = selectedIds.has(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => toggle(id)}
                      android_ripple={{ color: colors.accent }}
                      style={({ pressed }) => [
                        styles.friendRow,
                        {
                          borderBottomColor: colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Avatar name={f.name} url={f.avatarUrl} size={36} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={[styles.friendName, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {f.name}
                        </Text>
                        <Text
                          style={[styles.friendEmail, { color: colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          {f.email}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: checked ? colors.primary : colors.border,
                            backgroundColor: checked ? colors.primary : "transparent",
                          },
                        ]}
                      >
                        {checked && (
                          <Feather name="check" size={14} color="#fff" />
                        )}
                      </View>
                    </Pressable>
                  );
                })
              ) : (friendsQuery.data ?? []).length === 0 && !search ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Add some friends first to split expenses with them.
                </Text>
              ) : null}

              {userSearchEnabled && (
                <View style={{ marginTop: 8 }}>
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Not your friend yet
                  </Text>
                  {userSearch.isFetching && newPeople.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 16 }}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : newPeople.length === 0 ? (
                    <Text
                      style={[
                        styles.emptyText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      No users found for "{search}".
                    </Text>
                  ) : (
                    newPeople.map((u) => {
                      const isPending =
                        addFriend.isPending &&
                        addFriend.variables?.id === u.id;
                      return (
                        <View
                          key={u.id}
                          style={[
                            styles.friendRow,
                            { borderBottomColor: colors.border },
                          ]}
                        >
                          <Avatar
                            name={u.name}
                            url={u.avatarUrl}
                            size={36}
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text
                              style={[
                                styles.friendName,
                                { color: colors.foreground },
                              ]}
                              numberOfLines={1}
                            >
                              {u.name}
                            </Text>
                            <Text
                              style={[
                                styles.friendEmail,
                                { color: colors.mutedForeground },
                              ]}
                              numberOfLines={1}
                            >
                              {u.email}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => addFriend.mutate(u)}
                            disabled={isPending}
                            style={({ pressed }) => [
                              styles.addBtn,
                              {
                                backgroundColor: colors.primary,
                                opacity: isPending ? 0.6 : pressed ? 0.85 : 1,
                              },
                            ]}
                          >
                            <Feather name="user-plus" size={13} color="#fff" />
                            <Text style={styles.addBtnText}>
                              {isPending ? "Adding…" : "Add"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </ScrollView>

            {selectedIds.size > 0 && (
              <Pressable
                onPress={onContinue}
                style={[styles.continueBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.continueBtnText}>
                  Continue with {selectedIds.size}{" "}
                  {selectedIds.size === 1 ? "friend" : "friends"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {chosenFriends && me.data?.id && (
        <AddExpenseWithFriendModal
          friends={chosenFriends}
          currentUserId={me.data.id}
          onClose={() => setChosenFriends(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  ctaBtn: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  ctaBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 70 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  headerCancel: { fontFamily: "Inter_500Medium", fontSize: 15 },
  headerSave: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    padding: 0,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  friendName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  friendEmail: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  continueBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
