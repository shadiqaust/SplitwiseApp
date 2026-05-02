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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SplitType,
  useCreateFriendExpense,
  getGetDashboardSummaryQueryKey,
  getGetActivityQueryKey,
} from "@workspace/api-client-react";

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { Avatar } from "@/components/ui/Avatar";
import { useColors } from "@/hooks/useColors";
import { authFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { getErrorMessage } from "@/lib/error";
import { getCategoryIcon, guessCategory } from "@/lib/expenseCategories";

interface ApiFriend {
  id: string | number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

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

export interface FriendLike {
  id: string | number;
  name: string;
}

export function AddExpenseWithFriendModal({
  friends,
  currentUserId,
  onClose,
}: {
  friends: FriendLike[];
  currentUserId: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const createExpense = useCreateFriendExpense();

  // UI-only split mode. "loan" = lent the full amount to the friend (single-friend only).
  type Mode = "equal" | "exact" | "loan";

  // Editable friend list (initial value comes from `friends` prop, but the user
  // can add more or remove some inside the modal).
  const [friendsList, setFriendsList] = useState<FriendLike[]>(friends);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>(currentUserId);
  const [mode, setMode] = useState<Mode>("equal");
  // Exact-amount inputs, keyed by user id (used only when mode === "exact").
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const friendIds = useMemo(
    () => friendsList.map((f) => String(f.id)),
    [friendsList],
  );
  const isMulti = friendsList.length > 1;

  // Participants (me + friends), in a stable order. "You" is always first.
  const participants = useMemo(
    () => [
      { id: currentUserId, name: "You", isMe: true },
      ...friendsList.map((f) => ({
        id: String(f.id),
        name: f.name,
        isMe: false,
      })),
    ],
    [currentUserId, friendsList],
  );

  const allFriendsQuery = useQuery<ApiFriend[]>({
    queryKey: ["friends-mobile"],
    queryFn: async () => {
      const res = await authFetch("/api/friends");
      if (!res.ok) throw new Error("Failed to load friends");
      return res.json();
    },
  });

  useEffect(() => {
    if (isMulti && mode !== "equal") setMode("equal");
  }, [isMulti, mode]);

  useEffect(() => {
    const ids = new Set([currentUserId, ...friendIds]);
    if (!ids.has(paidByUserId)) setPaidByUserId(currentUserId);
  }, [friendIds, currentUserId, paidByUserId]);

  const addFriend = (f: ApiFriend) => {
    setFriendsList((prev) => {
      const key = String(f.id);
      if (prev.some((x) => String(x.id) === key)) return prev;
      return [...prev, { id: f.id, name: f.name }];
    });
  };
  const removeFriend = (id: string | number) => {
    setFriendsList((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((f) => String(f.id) !== String(id));
    });
  };

  const availableFriends = useMemo(() => {
    const have = new Set(friendIds);
    return (allFriendsQuery.data ?? []).filter(
      (f) => !have.has(String(f.id)) && String(f.id) !== currentUserId,
    );
  }, [allFriendsQuery.data, friendIds, currentUserId]);

  const updateExactAmount = (userId: string, value: string) => {
    setExactAmounts((prev) => ({ ...prev, [userId]: value }));
  };

  const computeEqualSplits = (total: number) => {
    const totalCents = Math.round(total * 100);
    const baseCents = Math.floor(totalCents / participants.length);
    let remainder = totalCents - baseCents * participants.length;
    return participants.map((p) => {
      const cents = baseCents + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return { userId: p.id, amount: cents / 100 };
    });
  };

  const onSubmit = () => {
    const total = parseFloat(amount);
    if (!description.trim()) {
      Alert.alert("Description required");
      return;
    }
    if (!total || total <= 0) {
      Alert.alert("Invalid amount");
      return;
    }

    // Multi-friend non-group expenses must split equally — derive the effective
    // mode at submit time so a stale `mode` can't slip through.
    const effectiveMode: Mode = isMulti ? "equal" : mode;

    let splits: Array<{ userId: string; amount: number }> = [];
    let splitTypeForApi: SplitType;
    let paidByForApi = paidByUserId;
    if (effectiveMode === "equal") {
      splitTypeForApi = SplitType.equal;
      splits = computeEqualSplits(total);
    } else if (effectiveMode === "loan") {
      // I lent the full amount to the friend → I pay everything, friend owes 100%.
      splitTypeForApi = SplitType.exact;
      paidByForApi = currentUserId;
      const friendId = friendsList[0] ? String(friendsList[0].id) : "";
      splits = [
        { userId: currentUserId, amount: 0 },
        { userId: friendId, amount: total },
      ];
    } else {
      splitTypeForApi = SplitType.exact;
      const sum = participants.reduce(
        (acc, p) => acc + (parseFloat(exactAmounts[p.id] ?? "0") || 0),
        0,
      );
      if (Math.abs(sum - total) > 0.01) {
        Alert.alert(`Exact amounts must sum to ${formatCurrency(total)}`);
        return;
      }
      splits = participants.map((p) => ({
        userId: p.id,
        amount: parseFloat(exactAmounts[p.id] ?? "0") || 0,
      }));
    }

    createExpense.mutate(
      {
        data: {
          friendUserIds: friendIds,
          description: description.trim(),
          category: category && category !== "General" ? category : null,
          totalAmount: total,
          currency: "USD",
          splitType: splitTypeForApi,
          paidByUserId: paidByForApi,
          date: new Date().toISOString().slice(0, 10),
          splits,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["friends-mobile"] });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetActivityQueryKey(),
          });
          onClose();
        },
        onError: (err: unknown) => {
          Alert.alert("Failed to add expense", getErrorMessage(err));
        },
      },
    );
  };

  const titleSubtext = isMulti
    ? `${friendsList.length} friends`
    : friendsList[0]?.name ?? "";

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 8) }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerSide}>
            <Text style={[styles.headerCancel, { color: colors.primary }]}>Cancel</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              Add expense
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              with {titleSubtext}
            </Text>
          </View>
          <Pressable
            onPress={onSubmit}
            disabled={createExpense.isPending}
            hitSlop={12}
            style={styles.headerSide}
          >
            <Text
              style={[
                styles.headerSave,
                {
                  color: createExpense.isPending ? colors.mutedForeground : colors.primary,
                  textAlign: "right",
                },
              ]}
            >
              {createExpense.isPending ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Friends</Text>
            <View style={styles.chipsWrap}>
              {friendsList.map((f) => (
                <View
                  key={String(f.id)}
                  style={[
                    styles.friendPill,
                    { borderColor: colors.border, backgroundColor: colors.muted },
                  ]}
                >
                  <Text
                    style={[styles.friendPillText, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {f.name}
                  </Text>
                  {friendsList.length > 1 && (
                    <Pressable
                      onPress={() => removeFriend(f.id)}
                      hitSlop={8}
                      style={styles.friendPillRemove}
                    >
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable
                onPress={() => setPickerOpen(true)}
                disabled={
                  allFriendsQuery.isLoading || availableFriends.length === 0
                }
                style={[
                  styles.friendAddBtn,
                  {
                    borderColor: colors.border,
                    opacity:
                      allFriendsQuery.isLoading || availableFriends.length === 0
                        ? 0.5
                        : 1,
                  },
                ]}
              >
                <Feather name="plus" size={14} color={colors.primary} />
                <Text
                  style={[styles.friendAddBtnText, { color: colors.primary }]}
                >
                  {availableFriends.length === 0 ? "No more" : "Add friend"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[
                styles.fieldInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.muted,
                },
              ]}
              placeholder="Dinner, Cab, Movie…"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                if (category === "General") {
                  const guess = guessCategory(v);
                  if (guess) setCategory(guess);
                }
              }}
              autoFocus
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Category</Text>
            <View style={styles.chipsWrap}>
              {EXPENSE_CATEGORIES.map((c) => {
                const selected = category === c;
                const Icon = getCategoryIcon(c);
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : "transparent",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={Icon as never}
                      size={14}
                      color={selected ? "#fff" : colors.foreground}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? "#fff" : colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Amount</Text>
            <TextInput
              style={[
                styles.fieldInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.muted,
                },
              ]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Paid by</Text>
            <View style={styles.chipsWrap}>
              {participants.map((p) => {
                const selected = (mode === "loan" ? currentUserId : paidByUserId) === p.id;
                const disabled = mode === "loan" && p.id !== currentUserId;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      if (disabled) return;
                      setPaidByUserId(p.id);
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : "transparent",
                        opacity: disabled ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? "#fff" : colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Split</Text>
            <View style={styles.chipsWrap}>
              <Pressable
                onPress={() => setMode("equal")}
                style={[
                  styles.chip,
                  {
                    borderColor: mode === "equal" ? colors.primary : colors.border,
                    backgroundColor: mode === "equal" ? colors.primary : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: mode === "equal" ? "#fff" : colors.foreground },
                  ]}
                >
                  Equally ({participants.length} ways)
                </Text>
              </Pressable>
              {!isMulti && (
                <Pressable
                  onPress={() => setMode("exact")}
                  style={[
                    styles.chip,
                    {
                      borderColor: mode === "exact" ? colors.primary : colors.border,
                      backgroundColor: mode === "exact" ? colors.primary : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: mode === "exact" ? "#fff" : colors.foreground },
                    ]}
                  >
                    Exact amounts
                  </Text>
                </Pressable>
              )}
              {!isMulti && (
                <Pressable
                  onPress={() => setMode("loan")}
                  style={[
                    styles.chip,
                    {
                      borderColor: mode === "loan" ? colors.primary : colors.border,
                      backgroundColor: mode === "loan" ? colors.primary : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: mode === "loan" ? "#fff" : colors.foreground },
                    ]}
                  >
                    Lent full to {friendsList[0]?.name ?? "friend"}
                  </Text>
                </Pressable>
              )}
            </View>
            {isMulti && (
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                Multi-friend expenses always split equally.
              </Text>
            )}
            {mode === "loan" && !isMulti && (
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                You paid the full amount. {friendsList[0]?.name ?? "Your friend"} owes you{" "}
                {amount ? formatCurrency(parseFloat(amount) || 0) : "the entire amount"}.
              </Text>
            )}
          </View>

          {mode === "exact" && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Exact amounts
              </Text>
              {participants.map((p) => (
                <View key={p.id} style={styles.exactRow}>
                  <Text
                    style={[styles.exactLabel, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <TextInput
                    style={[
                      styles.exactInput,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.muted,
                      },
                    ]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={exactAmounts[p.id] ?? ""}
                    onChangeText={(v) => updateExactAmount(p.id, v)}
                  />
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={onSubmit}
            disabled={createExpense.isPending}
            style={[
              styles.submitBtn,
              {
                backgroundColor: colors.primary,
                opacity: createExpense.isPending ? 0.6 : 1,
              },
            ]}
          >
            <Text style={styles.submitBtnText}>
              {createExpense.isPending ? "Saving…" : "Save expense"}
            </Text>
          </Pressable>
        </ScrollView>

        <Modal
          visible={pickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPickerOpen(false)}
        >
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 8) },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Pressable
                onPress={() => setPickerOpen(false)}
                hitSlop={12}
                style={styles.headerSide}
              >
                <Text style={[styles.headerCancel, { color: colors.primary }]}>
                  Done
                </Text>
              </Pressable>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                  Add friends
                </Text>
              </View>
              <View style={styles.headerSide} />
            </View>
            <View style={{ flex: 1, padding: 16 }}>
              {allFriendsQuery.isLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : availableFriends.length === 0 ? (
                <Text
                  style={{
                    color: colors.mutedForeground,
                    textAlign: "center",
                    paddingVertical: 24,
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                  }}
                >
                  Everyone's already added.
                </Text>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled">
                  {availableFriends.map((f) => (
                    <Pressable
                      key={String(f.id)}
                      onPress={() => {
                        addFriend(f);
                        setPickerOpen(false);
                      }}
                      android_ripple={{ color: colors.accent }}
                      style={({ pressed }) => [
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 12,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Avatar name={f.name} url={f.avatarUrl} size={36} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={{
                            fontFamily: "Inter_600SemiBold",
                            fontSize: 15,
                            color: colors.foreground,
                          }}
                          numberOfLines={1}
                        >
                          {f.name}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Inter_400Regular",
                            fontSize: 12,
                            color: colors.mutedForeground,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {f.email}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  chipsWrap: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  helperText: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4 },
  exactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  friendPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
  },
  friendPillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    maxWidth: 140,
  },
  friendPillRemove: {
    padding: 2,
    borderRadius: 999,
  },
  friendAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: 4,
  },
  friendAddBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
