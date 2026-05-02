import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useQuery } from "@tanstack/react-query";
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

export function AddExpenseCTA() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const me = useGetMe();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenFriend, setChosenFriend] = useState<FriendLike | null>(null);
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
    if (!pickerOpen) setSearch("");
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

  const pickFriend = (f: ApiFriend) => {
    setChosenFriend({ id: f.id, name: f.name, avatarUrl: f.avatarUrl ?? null });
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
                Pick a friend to split with
              </Text>
            </View>
            <View style={styles.headerSide} />
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
                placeholder="Search friends…"
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {friendsQuery.isLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : filtered.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {(friendsQuery.data ?? []).length === 0
                  ? "Add some friends first to split expenses with them."
                  : "No friends match your search."}
              </Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
                {filtered.map((f) => (
                  <Pressable
                    key={String(f.id)}
                    onPress={() => pickFriend(f)}
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
                    <Feather
                      name="chevron-right"
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {chosenFriend && me.data?.id && (
        <AddExpenseWithFriendModal
          friend={chosenFriend}
          currentUserId={me.data.id}
          onClose={() => setChosenFriend(null)}
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
  headerSide: { width: 90 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  headerCancel: { fontFamily: "Inter_500Medium", fontSize: 15 },
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
    paddingVertical: 24,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  friendName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  friendEmail: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
});
