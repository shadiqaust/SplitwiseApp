import { useEffect, useState } from "react";
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
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { getCategoryIcon, guessCategory } from "@/lib/expenseCategories";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getGetActivityQueryKey,
  getListExpensesQueryKey,
  getListGroupsQueryKey,
  SplitType,
  useCreateExpense,
  useGetGroup,
  useGetMe,
} from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";

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

export default function NewExpenseScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId: string }>();
  const groupId = params.groupId!;
  const queryClient = useQueryClient();

  const me = useGetMe();
  const group = useGetGroup(groupId);
  const createExpense = useCreateExpense();

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const members = group.data?.members ?? [];

  // Default: paidBy = me, all members are participants
  useEffect(() => {
    if (paidByUserId === null && me.data) setPaidByUserId(me.data.id);
    if (participantIds.size === 0 && members.length > 0) {
      setParticipantIds(new Set(members.map((m) => m.userId)));
    }
  }, [me.data, members, paidByUserId, participantIds.size]);

  const toggleParticipant = (userId: string) => {
    const next = new Set(participantIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setParticipantIds(next);
  };

  const buildSplits = (): Array<{
    userId: string;
    amount: number;
    percentage?: number;
  }> => {
    const total = parseFloat(amount);
    const ids = Array.from(participantIds);
    if (splitType === SplitType.equal) {
      if (ids.length === 0) return [];
      const share = Math.round((total / ids.length) * 100) / 100;
      const remainder = Math.round((total - share * ids.length) * 100) / 100;
      return ids.map((userId, i) => ({
        userId,
        amount: i === 0 ? share + remainder : share,
      }));
    }
    if (splitType === SplitType.exact) {
      return ids.map((userId) => ({
        userId,
        amount: parseFloat(exactAmounts[userId] ?? "0") || 0,
      }));
    }
    return ids.map((userId) => {
      const pct = parseFloat(percentages[userId] ?? "0") || 0;
      return {
        userId,
        amount: Math.round(total * (pct / 100) * 100) / 100,
        percentage: pct,
      };
    });
  };

  const onSubmit = () => {
    const total = parseFloat(amount);
    if (!description.trim()) return setError("Description is required");
    if (!total || total <= 0) return setError("Enter a valid amount");
    if (!paidByUserId) return setError("Select who paid");
    if (participantIds.size === 0)
      return setError("Select at least one participant");

    const splits = buildSplits();

    if (splitType === SplitType.exact) {
      const sum = splits.reduce((acc, s) => acc + (s.amount ?? 0), 0);
      if (Math.abs(sum - total) > 0.01) {
        return setError(
          `Exact amounts must sum to ${total.toFixed(2)} (got ${sum.toFixed(2)})`,
        );
      }
    }
    if (splitType === SplitType.percentage) {
      const sum = splits.reduce((acc, s) => acc + (s.percentage ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        return setError(`Percentages must sum to 100 (got ${sum.toFixed(2)})`);
      }
    }

    setError(null);
    createExpense.mutate(
      {
        groupId,
        data: {
          description: description.trim(),
          category: category && category !== "General" ? category : null,
          totalAmount: total,
          currency: group.data?.currency ?? "USD",
          splitType,
          paidByUserId,
          date: new Date().toISOString().slice(0, 10),
          splits,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListExpensesQueryKey(groupId),
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
          setError(getErrorMessage(err, "Failed to add expense"));
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Add expense", presentation: "modal" }} />
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
                <Text style={[styles.groupBannerLabel, { color: colors.mutedForeground }]}>Adding expense to</Text>
                <Text style={[styles.groupBannerName, { color: colors.foreground }]} numberOfLines={1}>
                  {group.data.name}
                </Text>
              </View>
            </View>
          )}

          <Input
            label="Description"
            placeholder="Dinner, Groceries, Hotel..."
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              if (category === "General") {
                const guess = guessCategory(v);
                if (guess) setCategory(guess);
              }
            }}
          />
          <Input
            label="Amount"
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />

          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Category
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    {
                      borderColor:
                        category === c ? colors.primary : colors.border,
                      backgroundColor:
                        category === c ? colors.accent : colors.card,
                      borderRadius: colors.radius,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={getCategoryIcon(c)}
                    size={14}
                    color={colors.foreground}
                  />
                  <Text style={[styles.chipText, { color: colors.foreground }]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Paid by
            </Text>
            <View style={styles.chipRow}>
              {members.map((m) => (
                <Pressable
                  key={m.userId}
                  onPress={() => setPaidByUserId(m.userId)}
                  style={[
                    styles.chip,
                    {
                      borderColor:
                        paidByUserId === m.userId ? colors.primary : colors.border,
                      backgroundColor:
                        paidByUserId === m.userId ? colors.accent : colors.card,
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
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Split
            </Text>
            <View style={styles.chipRow}>
              {(
                [
                  { v: SplitType.equal, l: "Equally" },
                  { v: SplitType.exact, l: "Exact amounts" },
                  { v: SplitType.percentage, l: "Percentages" },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.v}
                  onPress={() => setSplitType(opt.v)}
                  style={[
                    styles.chip,
                    {
                      borderColor:
                        splitType === opt.v ? colors.primary : colors.border,
                      backgroundColor:
                        splitType === opt.v ? colors.accent : colors.card,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: colors.foreground }]}>
                    {opt.l}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Card style={{ gap: 12 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Participants
            </Text>
            {members.map((m) => {
              const checked = participantIds.has(m.userId);
              return (
                <Pressable
                  key={m.userId}
                  onPress={() => toggleParticipant(m.userId)}
                  style={styles.participantRow}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: checked ? colors.primary : colors.border,
                        backgroundColor: checked ? colors.primary : "transparent",
                      },
                    ]}
                  >
                    {checked ? (
                      <Feather name="check" size={14} color="#fff" />
                    ) : null}
                  </View>
                  <Avatar name={m.user.name} url={m.user.avatarUrl} size={32} />
                  <Text style={[styles.partName, { color: colors.foreground }]}>
                    {m.user.id === me.data?.id ? "You" : m.user.name}
                  </Text>
                  {checked && splitType === SplitType.exact ? (
                    <Input
                      placeholder="0.00"
                      value={exactAmounts[m.userId] ?? ""}
                      onChangeText={(v) =>
                        setExactAmounts((prev) => ({ ...prev, [m.userId]: v }))
                      }
                      keyboardType="decimal-pad"
                      style={styles.smallInput}
                    />
                  ) : null}
                  {checked && splitType === SplitType.percentage ? (
                    <Input
                      placeholder="%"
                      value={percentages[m.userId] ?? ""}
                      onChangeText={(v) =>
                        setPercentages((prev) => ({ ...prev, [m.userId]: v }))
                      }
                      keyboardType="decimal-pad"
                      style={styles.smallInput}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </Card>

          {error ? (
            <Text style={{ color: colors.destructive }}>{error}</Text>
          ) : null}

          <View style={{ gap: 8 }}>
            <Button
              title="Save expense"
              onPress={onSubmit}
              loading={createExpense.isPending}
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
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },
  groupBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  groupBannerAvatar: { width: 44, height: 44, borderRadius: 10 },
  groupBannerAvatarFallback: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  groupBannerAvatarText: { fontFamily: "Inter_700Bold", fontSize: 20 },
  groupBannerLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
  groupBannerName: { fontFamily: "Inter_700Bold", fontSize: 16, marginTop: 1 },
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
  participantRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  partName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  smallInput: { width: 90, paddingVertical: 6 },
});
