import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import {
  Image,
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
  useGetGroupBalances,
  useGetMe,
} from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";

export default function NewPaymentScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId: string; toUserId?: string }>();
  const groupId = Number(params.groupId);
  const initialToUserId = params.toUserId ? Number(params.toUserId) : null;
  const queryClient = useQueryClient();

  const me = useGetMe();
  const group = useGetGroup(groupId);
  const balances = useGetGroupBalances(groupId);
  const createPayment = useCreatePayment();

  const [fromUserId, setFromUserId] = useState<number | null>(null);
  const [toUserId, setToUserId] = useState<number | null>(initialToUserId);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const members = group.data?.members ?? [];

  const balanceHint = useMemo(() => {
    if (!fromUserId || !toUserId || fromUserId === toUserId || !balances.data) return null;
    const myId = me.data?.id;
    const owes = balances.data.find((b) => b.fromUserId === fromUserId && b.toUserId === toUserId);
    const owed = balances.data.find((b) => b.fromUserId === toUserId && b.toUserId === fromUserId);
    const fromName = fromUserId === myId ? "You" : members.find((m) => m.userId === fromUserId)?.user.name ?? "Payer";
    const toName = toUserId === myId ? "you" : members.find((m) => m.userId === toUserId)?.user.name ?? "Recipient";
    if (owes) return { text: `${fromName} owe${fromUserId !== myId ? "s" : ""} ${toName} $${owes.amount.toFixed(2)}`, amount: owes.amount, positive: true };
    if (owed) {
      const oweeName = owed.fromUserId === myId ? "You" : members.find((m) => m.userId === owed.fromUserId)?.user.name ?? "";
      const owedToName = owed.toUserId === myId ? "you" : members.find((m) => m.userId === owed.toUserId)?.user.name ?? "";
      return { text: `${oweeName} owe${owed.fromUserId !== myId ? "s" : ""} ${owedToName} $${owed.amount.toFixed(2)} — no payment needed`, amount: null, positive: false };
    }
    return { text: "All settled up between these two", amount: null, positive: false };
  }, [fromUserId, toUserId, balances.data, me.data?.id, members]);

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
          {group.data && (
            <View style={[styles.groupBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {group.data.avatarUrl ? (
                <Image source={{ uri: group.data.avatarUrl }} style={styles.groupBannerAvatar} />
              ) : (
                <View style={[styles.groupBannerAvatarFallback, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.groupBannerAvatarText, { color: colors.accentForeground }]}>
                    {group.data.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupBannerLabel, { color: colors.mutedForeground }]}>Settling up in</Text>
                <Text style={[styles.groupBannerName, { color: colors.foreground }]} numberOfLines={1}>
                  {group.data.name}
                </Text>
              </View>
            </View>
          )}

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

          {balanceHint && (
            <View style={[
              styles.hintCard,
              {
                backgroundColor: balanceHint.positive ? "#fef9c3" : colors.muted,
                borderColor: balanceHint.positive ? "#fde68a" : colors.border,
              },
            ]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Text style={[styles.hintText, { color: balanceHint.positive ? "#92400e" : colors.mutedForeground, flex: 1 }]}>
                  {balanceHint.text}
                </Text>
                {balanceHint.amount !== null && (
                  <Pressable
                    onPress={() => setAmount(balanceHint.amount!.toFixed(2))}
                    style={[styles.hintBtn, { borderColor: "#d97706", backgroundColor: "#fffbeb" }]}
                  >
                    <Text style={styles.hintBtnText}>Use amount</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

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
  groupBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  groupBannerAvatar: { width: 44, height: 44, borderRadius: 10 },
  groupBannerAvatarFallback: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  groupBannerAvatarText: { fontFamily: "Inter_700Bold", fontSize: 20 },
  groupBannerLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
  groupBannerName: { fontFamily: "Inter_700Bold", fontSize: 16, marginTop: 1 },
  hintCard: { borderWidth: 1, borderRadius: 10, padding: 12 },
  hintText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  hintBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  hintBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#b45309" },
});
