import { useMemo, useState } from "react";
import {
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
import { useQueryClient } from "@tanstack/react-query";
import {
  SplitType,
  useCreateFriendExpense,
  useGetMe,
  getGetDashboardSummaryQueryKey,
  getGetActivityQueryKey,
} from "@workspace/api-client-react";

import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { formatCurrency } from "@/lib/format";
import { getErrorMessage } from "@/lib/error";
import { getCategoryIcon, guessCategory } from "@/lib/expenseCategories";
import { Avatar } from "@/components/ui/Avatar";

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
  avatarUrl?: string | null;
}

export function AddExpenseWithFriendModal({
  friend,
  currentUserId,
  onClose,
}: {
  friend: FriendLike;
  currentUserId: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const createExpense = useCreateFriendExpense();
  const { data: me } = useGetMe();
  const defaultCurrency = me?.defaultCurrency ?? "USD";

  const friendId = String(friend.id);

  // Participants (me + the single friend). "You" is always first.
  const participants = useMemo(
    () => [
      { id: currentUserId, name: "You", isMe: true, avatarUrl: null as string | null },
      { id: friendId, name: friend.name, isMe: false, avatarUrl: friend.avatarUrl ?? null },
    ],
    [currentUserId, friendId, friend.name, friend.avatarUrl],
  );

  // UI-only split mode. "loan" = the payer lent the full amount to the other.
  type Mode = "equal" | "exact" | "loan";

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>(currentUserId);
  const [mode, setMode] = useState<Mode>("equal");
  const lenderIsMe = paidByUserId === currentUserId;
  const lenderName = lenderIsMe ? "You" : friend.name;
  const borrowerName = lenderIsMe ? friend.name : "you";
  // Exact-amount inputs, keyed by user id (used only when mode === "exact").
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});

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

    let splits: Array<{ userId: string; amount: number }> = [];
    let splitTypeForApi: SplitType;
    let paidByForApi = paidByUserId;
    if (mode === "equal") {
      splitTypeForApi = SplitType.equal;
      splits = computeEqualSplits(total);
    } else if (mode === "loan") {
      // The payer lent the full amount → payer owes 0, the other owes 100%.
      splitTypeForApi = SplitType.exact;
      const borrowerId = paidByUserId === currentUserId ? friendId : currentUserId;
      splits = [
        { userId: paidByUserId, amount: 0 },
        { userId: borrowerId, amount: total },
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
          friendUserIds: [friendId],
          description: description.trim(),
          category: category && category !== "General" ? category : null,
          totalAmount: total,
          currency: defaultCurrency,
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
              with {friend.name}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
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
            </ScrollView>
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
                const selected = paidByUserId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPaidByUserId(p.id)}
                    style={[
                      styles.chip,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : "transparent",
                      },
                    ]}
                  >
                    <Avatar name={p.name} url={p.avatarUrl} size={20} />
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
                  Equally (2 ways)
                </Text>
              </Pressable>
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
                  {lenderIsMe
                    ? `Lent full to ${friend.name}`
                    : `${friend.name} lent full to you`}
                </Text>
              </Pressable>
            </View>
            {mode === "loan" && (
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                {lenderName} paid the full amount. {borrowerName}{" "}
                {lenderIsMe ? "owes you" : "owe"}{" "}
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
});
