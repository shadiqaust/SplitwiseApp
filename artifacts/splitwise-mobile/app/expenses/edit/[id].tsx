import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { getCategoryIcon } from "@/lib/expenseCategories";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getGetGroupQueryKey,
  getListExpensesQueryKey,
  getGetExpenseQueryKey,
  useGetExpense,
  useGetGroup,
  useGetMe,
  useUpdateExpense,
  SplitType,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";
import { getErrorMessage } from "@/lib/error";
import { photoUri, uploadPhotoFromUri } from "@/lib/upload";

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

type Participant = { userId: string; name: string };

export default function EditExpenseScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const expenseId = String(params.id ?? "");
  const queryClient = useQueryClient();

  const me = useGetMe();
  const myId = me.data?.id;
  const expenseQ = useGetExpense(expenseId);
  const expense = expenseQ.data;
  const groupId = expense?.groupId ?? "";
  const groupQ = useGetGroup(groupId, {
    query: {
      queryKey: getGetGroupQueryKey(groupId),
      enabled: Boolean(expense?.groupId),
    },
  });
  const updateExpense = useUpdateExpense();

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>("");
  const [splitType, setSplitType] = useState<SplitType>(SplitType.equal);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [date, setDate] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const participants = useMemo<Participant[]>(() => {
    if (!expense) return [];
    if (expense.groupId) {
      const members = groupQ.data?.members ?? [];
      return members.map((m) => ({
        userId: m.userId,
        name: m.user?.name ?? "Member",
      }));
    }
    const seen = new Map<string, string>();
    for (const s of expense.splits) {
      seen.set(s.userId, s.user?.name ?? "Member");
    }
    if (expense.paidByUser) {
      seen.set(expense.paidByUserId, expense.paidByUser.name);
    }
    return Array.from(seen.entries()).map(([userId, name]) => ({
      userId,
      name,
    }));
  }, [expense, groupQ.data]);

  useEffect(() => {
    if (hydrated || !expense) return;
    if (expense.groupId && !groupQ.data) return;
    setDescription(expense.description);
    setCategory(expense.category ?? "General");
    setAmount(String(expense.totalAmount));
    setPaidByUserId(expense.paidByUserId);
    setSplitType(expense.splitType as SplitType);
    setParticipantIds(new Set(expense.splits.map((s) => s.userId)));
    setExactAmounts(
      Object.fromEntries(
        expense.splits.map((s) => [s.userId, String(s.amount)]),
      ),
    );
    setPercentages(
      Object.fromEntries(
        expense.splits.map((s) => [
          s.userId,
          s.percentage != null ? String(s.percentage) : "",
        ]),
      ),
    );
    setDate(expense.date);
    setPhotoUrl(expense.photoUrl ?? null);
    setHydrated(true);
  }, [expense, groupQ.data, hydrated]);

  const toggleParticipant = (userId: string) => {
    if (userId === paidByUserId) return;
    const next = new Set(participantIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setParticipantIds(next);
  };

  const changePayer = (userId: string) => {
    setPaidByUserId(userId);
    setParticipantIds((prev) => {
      if (prev.has(userId)) return prev;
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  };

  const pickPhoto = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission denied.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const contentType = asset.mimeType ?? "image/jpeg";
    setUploading(true);
    try {
      const objectPath = await uploadPhotoFromUri(
        asset.uri,
        contentType,
        asset.fileName ?? undefined,
      );
      setPhotoUrl(objectPath);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
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

  const onSave = () => {
    if (!expenseId || !expense) return;
    setError(null);
    const total = parseFloat(amount);
    if (!description.trim()) {
      setError("Description required");
      return;
    }
    if (!total || total <= 0) {
      setError("Invalid amount");
      return;
    }
    if (participantIds.size === 0) {
      setError("Select at least one participant");
      return;
    }
    const splits = buildSplits();
    if (splitType === SplitType.exact) {
      const sum = splits.reduce((a, s) => a + s.amount, 0);
      if (Math.abs(sum - total) > 0.01) {
        setError(`Exact amounts must sum to ${total.toFixed(2)}`);
        return;
      }
    }
    if (splitType === SplitType.percentage) {
      const sum = splits.reduce((a, s) => a + (s.percentage ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        setError("Percentages must sum to 100");
        return;
      }
    }

    updateExpense.mutate(
      {
        expenseId,
        data: {
          description: description.trim(),
          category: category && category !== "General" ? category : null,
          totalAmount: total,
          splitType,
          paidByUserId,
          date,
          photoUrl,
          splits,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetExpenseQueryKey(expenseId),
          });
          queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: ["non-group-expenses"] });
          queryClient.invalidateQueries({ queryKey: ["friend-activity"] });
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          queryClient.invalidateQueries({ queryKey: ["friends-mobile"] });
          if (expense.groupId) {
            queryClient.invalidateQueries({
              queryKey: getListExpensesQueryKey(expense.groupId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetGroupBalancesQueryKey(expense.groupId),
            });
          }
          if (router.canGoBack()) router.back();
          else router.replace(`/expenses/${expenseId}`);
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  };

  if (expenseQ.isLoading || (expense?.groupId && groupQ.isLoading)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Expense not found.</Text>
      </View>
    );
  }

  const photoSrcUri = photoUri(photoUrl);

  return (
    <>
      <Stack.Screen
        options={{ title: "Edit expense", headerBackTitle: "Back" }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Description
            </Text>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Dinner, Groceries..."
            />

            <Text style={[styles.label, { color: colors.foreground }]}>
              Amount
            </Text>
            <Input
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />

            <Text style={[styles.label, { color: colors.foreground }]}>
              Date
            </Text>
            <Input
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: colors.foreground }]}>
              Category
            </Text>
            <View style={styles.chipsWrap}>
              {EXPENSE_CATEGORIES.map((c) => {
                const active = c === category;
                const fg = active ? colors.primaryForeground : colors.foreground;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.muted,
                        opacity: pressed ? 0.85 : 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={getCategoryIcon(c)}
                      size={14}
                      color={fg}
                    />
                    <Text
                      style={{
                        color: fg,
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                      }}
                    >
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Paid by
            </Text>
            <View style={styles.chipsWrap}>
              {participants.map((p) => {
                const active = p.userId === paidByUserId;
                return (
                  <Pressable
                    key={p.userId}
                    onPress={() => changePayer(p.userId)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.muted,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active
                          ? colors.primaryForeground
                          : colors.foreground,
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                      }}
                    >
                      {p.userId === myId ? "You" : p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>
              Split type
            </Text>
            <View style={styles.chipsWrap}>
              {[
                { value: SplitType.equal, label: "Equally" },
                { value: SplitType.exact, label: "Exact" },
                { value: SplitType.percentage, label: "Percent" },
              ].map((opt) => {
                const active = splitType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSplitType(opt.value)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.muted,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active
                          ? colors.primaryForeground
                          : colors.foreground,
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>
              Participants
            </Text>
            <View style={{ gap: 6 }}>
              {participants.map((p) => {
                const checked = participantIds.has(p.userId);
                return (
                  <View key={p.userId} style={styles.participantRow}>
                    <Pressable
                      onPress={() => toggleParticipant(p.userId)}
                      style={[
                        styles.checkbox,
                        {
                          borderColor: colors.border,
                          backgroundColor: checked
                            ? colors.primary
                            : "transparent",
                        },
                      ]}
                    >
                      {checked && (
                        <Feather
                          name="check"
                          size={14}
                          color={colors.primaryForeground}
                        />
                      )}
                    </Pressable>
                    <Text
                      style={{
                        flex: 1,
                        color: colors.foreground,
                        fontFamily: "Inter_500Medium",
                        fontSize: 14,
                      }}
                    >
                      {p.userId === myId ? "You" : p.name}
                    </Text>
                    {checked && splitType === SplitType.exact && (
                      <View style={{ width: 90 }}>
                        <Input
                          value={exactAmounts[p.userId] ?? ""}
                          onChangeText={(t) =>
                            setExactAmounts((prev) => ({
                              ...prev,
                              [p.userId]: t,
                            }))
                          }
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    )}
                    {checked && splitType === SplitType.percentage && (
                      <View style={{ width: 70 }}>
                        <Input
                          value={percentages[p.userId] ?? ""}
                          onChangeText={(t) =>
                            setPercentages((prev) => ({
                              ...prev,
                              [p.userId]: t,
                            }))
                          }
                          placeholder="%"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </Card>

          <Card>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Receipt photo (optional)
            </Text>
            {photoSrcUri ? (
              <View>
                <Image
                  source={{ uri: photoSrcUri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Button
                    onPress={pickPhoto}
                    variant="outline"
                    disabled={uploading}
                    title={uploading ? "Uploading..." : "Replace"}
                  />
                  <Button
                    onPress={() => setPhotoUrl(null)}
                    variant="outline"
                    disabled={uploading}
                    title="Remove"
                  />
                </View>
              </View>
            ) : (
              <Button
                onPress={pickPhoto}
                variant="outline"
                disabled={uploading}
                title={uploading ? "Uploading..." : "Add receipt photo"}
              />
            )}
          </Card>

          {error && (
            <Text style={{ color: colors.negative, fontSize: 13 }}>{error}</Text>
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                variant="outline"
                fullWidth
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace(`/expenses/${expenseId}`);
                }}
                disabled={updateExpense.isPending}
                title="Cancel"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                fullWidth
                onPress={onSave}
                disabled={updateExpense.isPending || uploading}
                title={updateExpense.isPending ? "Saving..." : "Save changes"}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 14, paddingBottom: 60 },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginTop: 8,
    marginBottom: 6,
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: 8,
    backgroundColor: "#0001",
  },
});
