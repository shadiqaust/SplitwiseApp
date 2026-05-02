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
  const [chosenFriends, setChosenFriends] = useState<FriendLike[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, FriendLike>>(new Map());

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
      setSelected(new Map());
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

  const closePicker = () => setPickerOpen(false);

  const selectedCount = selected.size;

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
        <Feather name="plus" size={16} color="#fff" />
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
                Select friends to split with
              </Text>
            </View>
            <Pressable
              onPress={onNext}
              hitSlop={12}
              disabled={selectedCount === 0}
              style={styles.headerSide}
            >
              <Text
                style={[
                  styles.headerNext,
                  {
                    color: selectedCount > 0 ? colors.primary : colors.mutedForeground,
                    textAlign: "right",
                  },
                ]}
              >
                {selectedCount > 0 ? `Next (${selectedCount})` : "Next"}
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
                {filtered.map((f) => {
                  const key = String(f.id);
                  const isSelected = selected.has(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleFriend(f)}
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
                          styles.checkBox,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary : "transparent",
                          },
                        ]}
                      >
                        {isSelected && (
                          <Feather name="check" size={14} color="#fff" />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  ctaBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
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
  headerNext: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
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
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
