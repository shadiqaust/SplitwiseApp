import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getGetActivityQueryKey,
  getListGroupsQueryKey,
  getListPaymentsQueryKey,
  useCreatePayment,
  useGetGroup,
  useGetMe,
} from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";

export default function NewPaymentScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId: string }>();
  const groupId = Number(params.groupId);
  const queryClient = useQueryClient();

  const me = useGetMe();
  const group = useGetGroup(groupId);
  const createPayment = useCreatePayment();

  const [fromUserId, setFromUserId] = useState<number | null>(null);
  const [toUserId, setToUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const members = group.data?.members ?? [];

  useEffect(() => {
    if (fromUserId === null && me.data) setFromUserId(me.data.id);
  }, [me.data, fromUserId]);

  const onSubmit = () => {
    const value = parseFloat(amount);
    if (!fromUserId) return setError("Select who paid");
    if (!toUserId) return setError("Select who received the payment");
    if (fromUserId === toUserId) return setError("From and to must be different");
    if (!value || value <= 0) return setError("Enter a valid amount");

    setError(null);
    createPayment.mutate(
      {
        groupId,
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
          queryClient.invalidateQueries({
            queryKey: getListPaymentsQueryKey(groupId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetGroupBalancesQueryKey(groupId),
          });
          queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetActivityQueryKey(),
          });
          router.back();
        },
        onError: (err: unknown) => {
          setError(getErrorMessage(err, "Failed to record payment"));
        },
      },
    );
  };

  const renderChips = (
    selected: number | null,
    setSelected: (id: number) => void,
  ) => (
    <View style={styles.chipRow}>
      {members.map((m) => (
        <Pressable
          key={m.userId}
          onPress={() => setSelected(m.userId)}
          style={[
            styles.chip,
            {
              borderColor:
                selected === m.userId ? colors.primary : colors.border,
              backgroundColor:
                selected === m.userId ? colors.accent : colors.card,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Avatar name={m.user.name} url={m.user.avatarUrl} size={24} />
          <Text style={[styles.chipText, { color: colors.foreground }]}>
            {m.user.id === me.data?.id ? "You" : m.user.name.split(" ")[0]}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Settle up", presentation: "modal" }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              From
            </Text>
            {renderChips(fromUserId, setFromUserId)}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>To</Text>
            {renderChips(toUserId, setToUserId)}
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

          <View style={{ gap: 8 }}>
            <Button
              title="Record payment"
              onPress={onSubmit}
              loading={createPayment.isPending}
              fullWidth
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => router.back()}
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 16 },
  label: { fontFamily: "Inter_500Medium", fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
});
