import { useState } from "react";
import {
  Alert,
  Modal,
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
  getGetGroupBalancesQueryKey,
  getListPaymentsQueryKey,
  useDeletePayment,
  type Payment,
} from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency, formatDate } from "@/lib/format";

export function PaymentDetailModal({
  payment,
  currentUserId,
  onClose,
}: {
  payment: Payment;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const deleteMutation = useDeletePayment();
  const [error, setError] = useState<string | null>(null);

  const fromMe = currentUserId && String(payment.fromUserId) === currentUserId;
  const toMe = currentUserId && String(payment.toUserId) === currentUserId;
  const fromName = fromMe ? "You" : payment.fromUser?.name ?? "Someone";
  const toName = toMe ? "you" : payment.toUser?.name ?? "someone";
  const amount = Number(payment.amount);

  const onDelete = () => {
    Alert.alert(
      "Delete this payment?",
      "Removing this payment will recalculate balances for everyone involved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(
              { paymentId: payment.id },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() });
                  queryClient.invalidateQueries({
                    queryKey: getGetDashboardSummaryQueryKey(),
                  });
                  queryClient.invalidateQueries({ queryKey: ["non-group-expenses"] });
                  queryClient.invalidateQueries({ queryKey: ["friends"] });
                  queryClient.invalidateQueries({ queryKey: ["friends-mobile"] });
                  queryClient.invalidateQueries({ queryKey: ["friend-activity"] });
                  if (payment.groupId) {
                    queryClient.invalidateQueries({
                      queryKey: getListPaymentsQueryKey(payment.groupId),
                    });
                    queryClient.invalidateQueries({
                      queryKey: getGetGroupBalancesQueryKey(payment.groupId),
                    });
                  }
                  onClose();
                },
                onError: (err) => setError(getErrorMessage(err)),
              },
            );
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerSide}>
            <Text style={[styles.cancel, { color: colors.primary }]}>
              Close
            </Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Payment details
          </Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroBlock}>
            <View
              style={[
                styles.iconBubble,
                { backgroundColor: "#dcfce7" },
              ]}
            >
              <Feather name="check-circle" size={26} color="#16a34a" />
            </View>
            <Text style={[styles.amount, { color: "#16a34a" }]}>
              {formatCurrency(amount, payment.currency || "USD")}
            </Text>
            <View style={styles.partiesRow}>
              <Text style={[styles.partyName, { color: colors.foreground }]}>
                {fromName}
              </Text>
              <Feather
                name="arrow-right"
                size={16}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.partyName, { color: colors.foreground }]}
              >
                {toName}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.detailCard,
              { borderColor: colors.border, backgroundColor: colors.muted },
            ]}
          >
            <DetailRow
              label="Date"
              value={formatDate(payment.date)}
              colors={colors}
            />
            {payment.note ? (
              <DetailRow label="Note" value={payment.note} colors={colors} />
            ) : null}
            <DetailRow
              label="Type"
              value={payment.groupId ? "Group payment" : "Non-group payment"}
              colors={colors}
            />
            <DetailRow
              label="Recorded"
              value={formatDate(payment.createdAt)}
              colors={colors}
              last
            />
          </View>

          {error && (
            <Text style={[styles.errorText, { color: colors.negative }]}>
              {error}
            </Text>
          )}

          <Pressable
            onPress={onDelete}
            disabled={deleteMutation.isPending}
            style={({ pressed }) => [
              styles.deleteBtn,
              {
                backgroundColor: colors.negative,
                opacity: deleteMutation.isPending ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather name="trash-2" size={16} color="#fff" />
            <Text style={styles.deleteBtnText}>Delete payment</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  colors,
  last,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[styles.detailValue, { color: colors.foreground }]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 70 },
  cancel: { fontFamily: "Inter_500Medium", fontSize: 15 },
  title: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    textAlign: "center",
  },
  content: { padding: 20, gap: 20 },
  heroBlock: { alignItems: "center", gap: 8 },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  amount: { fontFamily: "Inter_700Bold", fontSize: 28, marginTop: 4 },
  partiesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  partyName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  detailRow: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  detailLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  detailValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flexShrink: 1,
    textAlign: "right",
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  confirmText: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
