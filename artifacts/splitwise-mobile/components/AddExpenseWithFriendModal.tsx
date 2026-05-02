import { useState } from "react";
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
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  SplitType,
  useCreateFriendExpense,
  getGetDashboardSummaryQueryKey,
  getGetActivityQueryKey,
} from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { formatCurrency } from "@/lib/format";
import { getErrorMessage } from "@/lib/error";

export interface FriendLike {
  id: string | number;
  name: string;
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
  const queryClient = useQueryClient();
  const friendId = String(friend.id);
  const createExpense = useCreateFriendExpense();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByMe, setPaidByMe] = useState(true);
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [myAmount, setMyAmount] = useState("");
  const [theirAmount, setTheirAmount] = useState("");

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
    if (splitType === SplitType.equal) {
      const totalCents = Math.round(total * 100);
      const half = Math.floor(totalCents / 2);
      const extra = totalCents - half * 2;
      splits = [
        { userId: currentUserId, amount: (half + extra) / 100 },
        { userId: friendId, amount: half / 100 },
      ];
    } else {
      const mine = parseFloat(myAmount) || 0;
      const theirs = parseFloat(theirAmount) || 0;
      if (Math.abs(mine + theirs - total) > 0.01) {
        Alert.alert(`Exact amounts must sum to ${formatCurrency(total)}`);
        return;
      }
      splits = [
        { userId: currentUserId, amount: mine },
        { userId: friendId, amount: theirs },
      ];
    }

    createExpense.mutate(
      {
        data: {
          friendUserId: friendId,
          description: description.trim(),
          totalAmount: total,
          currency: "USD",
          splitType,
          paidByUserId: paidByMe ? currentUserId : friendId,
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
    <Modal animationType="slide" transparent presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>
            Add expense with {friend.name}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              placeholder="Dinner, Cab, Movie…"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              autoFocus
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Amount</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Paid by</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { label: "You", value: true },
                { label: friend.name, value: false },
              ].map((opt) => {
                const selected = paidByMe === opt.value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => setPaidByMe(opt.value)}
                    style={[
                      styles.choice,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" },
                    ]}
                  >
                    <Text
                      style={[styles.choiceText, { color: selected ? "#fff" : colors.foreground }]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Split</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { label: "Equally (50/50)", value: SplitType.equal },
                { label: "Exact amounts", value: SplitType.exact },
              ].map((opt) => {
                const selected = splitType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSplitType(opt.value)}
                    style={[
                      styles.choice,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" },
                    ]}
                  >
                    <Text style={[styles.choiceText, { color: selected ? "#fff" : colors.foreground }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {splitType === SplitType.exact && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Exact amounts</Text>
              <View style={[styles.exactRow, { borderColor: colors.border }]}>
                <Text style={[styles.exactLabel, { color: colors.foreground }]}>You</Text>
                <TextInput
                  style={[styles.exactInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={myAmount}
                  onChangeText={setMyAmount}
                />
              </View>
              <View style={[styles.exactRow, { borderColor: colors.border }]}>
                <Text style={[styles.exactLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {friend.name}
                </Text>
                <TextInput
                  style={[styles.exactInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={theirAmount}
                  onChangeText={setTheirAmount}
                />
              </View>
            </View>
          )}

          <Pressable
            onPress={onSubmit}
            disabled={createExpense.isPending}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: createExpense.isPending ? 0.6 : 1 }]}
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
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17, flex: 1, marginRight: 12 },
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
