import { useEffect, useMemo, useState } from "react";
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
  useGetMe,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

export interface SettleFriend {
  id: string | number;
  name: string;
}

export function SettleUpWithFriendModal({
  friend,
  currentUserId,
  netBalance,
  balances,
  onClose,
}: {
  friend: SettleFriend;
  currentUserId: string;
  /** Positive: friend owes you. Negative: you owe friend. */
  netBalance?: number;
  /** Per-currency balances. Positive: friend owes you. Negative: you owe friend. */
  balances?: { currency: string; amount: number }[];
  onClose: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const createPayment = useCreateNonGroupPayment();
  const { data: me } = useGetMe();
  const friendId = String(friend.id);

  // Sort non-zero balances by absolute amount descending — largest first
  const nonZeroBalances = useMemo(
    () =>
      (balances ?? [])
        .filter((b) => Math.abs(b.amount) >= 0.01)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    [balances],
  );

  const [selectedCurrency, setSelectedCurrency] = useState<string>(
    nonZeroBalances[0]?.currency ?? me?.defaultCurrency ?? "USD",
  );
  const [direction, setDirection] = useState<"youPaid" | "friendPaid">("youPaid");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedBalance = nonZeroBalances.find((b) => b.currency === selectedCurrency);
  const effectiveNet = selectedBalance?.amount ?? (netBalance ?? 0);
  const currency = selectedCurrency || (me?.defaultCurrency ?? "USD");

  // Initialize on mount
  useEffect(() => {
    const defaultCur =
      nonZeroBalances.length > 0
        ? nonZeroBalances[0].currency
        : (me?.defaultCurrency ?? "USD");
    const net = nonZeroBalances.find((b) => b.currency === defaultCur)?.amount ?? (netBalance ?? 0);
    setSelectedCurrency(defaultCur);
    setDirection(net > 0 ? "friendPaid" : "youPaid");
    setAmount(Math.abs(net) > 0.005 ? Math.abs(net).toFixed(2) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromUserId = direction === "youPaid" ? currentUserId : friendId;
  const toUserId = direction === "youPaid" ? friendId : currentUserId;

  const hint =
    Math.abs(effectiveNet) > 0.005
      ? effectiveNet > 0
        ? `${friend.name} owes you ${formatCurrency(effectiveNet, currency)}`
        : `You owe ${friend.name} ${formatCurrency(Math.abs(effectiveNet), currency)}`
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
          currency,
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
            {nonZeroBalances.length > 1 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                {nonZeroBalances.map((b) => (
                  <Pressable
                    key={b.currency}
                    onPress={() => {
                      setSelectedCurrency(b.currency);
                      setDirection(b.amount > 0 ? "friendPaid" : "youPaid");
                      setAmount(Math.abs(b.amount) > 0.005 ? Math.abs(b.amount).toFixed(2) : "");
                    }}
                    style={[
                      {
                        paddingHorizontal: 14,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                      },
                      selectedCurrency === b.currency
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: colors.muted, borderColor: colors.border },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_600SemiBold",
                        color: selectedCurrency === b.currency ? colors.primaryForeground : colors.mutedForeground,
                      }}
                    >
                      {b.currency}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
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
              label={`Amount (${getCurrencySymbol(currency)})`}
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
  warning: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    gap: 10,
  },
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
