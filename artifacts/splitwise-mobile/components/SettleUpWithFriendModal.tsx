import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  useCreateNonGroupPayment,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency } from "@/lib/format";

export interface SettleFriend {
  id: string | number;
  name: string;
}

export function SettleUpWithFriendModal({
  friend,
  currentUserId,
  netBalance,
  onClose,
}: {
  friend: SettleFriend;
  currentUserId: string;
  /** Positive: friend owes you. Negative: you owe friend. */
  netBalance?: number;
  onClose: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const createPayment = useCreateNonGroupPayment();
  const friendId = String(friend.id);

  const [direction, setDirection] = useState<"youPaid" | "friendPaid">(
    typeof netBalance === "number" && netBalance > 0 ? "friendPaid" : "youPaid",
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof netBalance === "number" && Math.abs(netBalance) > 0.005) {
      setAmount(Math.abs(netBalance).toFixed(2));
    }
  }, [netBalance]);

  const fromUserId = direction === "youPaid" ? currentUserId : friendId;
  const toUserId = direction === "youPaid" ? friendId : currentUserId;

  const hint =
    typeof netBalance === "number" && Math.abs(netBalance) > 0.005
      ? netBalance > 0
        ? `${friend.name} owes you ${formatCurrency(netBalance)}`
        : `You owe ${friend.name} ${formatCurrency(Math.abs(netBalance))}`
      : "All settled up";

  const onSubmit = () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) return setError("Enter a valid amount");
    setError(null);
    createPayment.mutate(
      {
        data: {
          fromUserId,
          toUserId,
          amount: value,
          note: note.trim() || null,
          date: new Date().toISOString().slice(0, 10),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["friends-mobile"] });
          queryClient.invalidateQueries({
            queryKey: ["friend-activity", friendId],
          });
          queryClient.invalidateQueries({ queryKey: ["non-group-expenses"] });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetActivityQueryKey(),
          });
          onClose();
        },
        onError: (err: unknown) => {
          setError(getErrorMessage(err, "Failed to record payment"));
        },
      },
    );
  };

  const fromLabel = direction === "youPaid" ? "You" : friend.name;
  const toLabel = direction === "youPaid" ? friend.name : "You";

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Settle up with {friend.name}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.hint,
                { borderColor: colors.border, backgroundColor: colors.muted },
              ]}
            >
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                }}
              >
                {hint}
              </Text>
            </View>

            <View style={styles.directionRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  From
                </Text>
                <View
                  style={[
                    styles.fromBox,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}
                  >
                    {fromLabel}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() =>
                  setDirection((d) => (d === "youPaid" ? "friendPaid" : "youPaid"))
                }
                style={[
                  styles.swap,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
                hitSlop={8}
              >
                <Feather name="repeat" size={16} color={colors.mutedForeground} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>To</Text>
                <View
                  style={[
                    styles.fromBox,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}
                  >
                    {toLabel}
                  </Text>
                </View>
              </View>
            </View>

            <Input
              label="Amount"
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />

            <Input
              label="Note (optional)"
              placeholder="Cash / Venmo / etc."
              value={note}
              onChangeText={setNote}
            />

            {error ? (
              <Text style={{ color: colors.destructive }}>{error}</Text>
            ) : null}

            <View style={{ gap: 8, marginTop: 8 }}>
              <Button
                title="Record payment"
                onPress={onSubmit}
                loading={createPayment.isPending}
                fullWidth
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={onClose}
                fullWidth
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 16, flex: 1 },
  body: { padding: 16, gap: 14 },
  hint: { borderRadius: 10, borderWidth: 1, padding: 12 },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginBottom: 6,
  },
  directionRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  fromBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  swap: {
    borderWidth: 1,
    borderRadius: 10,
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
