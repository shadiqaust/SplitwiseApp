import { useState } from "react";
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
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListGroupsQueryKey,
  useCreateGroup,
  useGetMe,
} from "@workspace/api-client-react";
import { useEffect } from "react";
import { Feather } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";
import { COMMON_CURRENCIES } from "@/lib/currencies";

export default function NewGroupScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const createGroup = useCreateGroup();
  const me = useGetMe();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.data?.defaultCurrency && !currencyTouched) {
      setCurrency(me.data.defaultCurrency);
    }
  }, [me.data?.defaultCurrency, currencyTouched]);

  const selectedCurrency = COMMON_CURRENCIES.find((c) => c.code === currency) ?? COMMON_CURRENCIES[0];

  const onSubmit = () => {
    if (!name.trim()) {
      setError("Group name is required");
      return;
    }
    setError(null);
    createGroup.mutate(
      {
        data: {
          name: name.trim(),
          description: description.trim() || null,
          currency,
        },
      },
      {
        onSuccess: (group) => {
          queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          router.replace(`/groups/${group.id}`);
        },
        onError: (err: unknown) => {
          setError(getErrorMessage(err, "Failed to create group"));
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "New group" }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={{ gap: 16 }}>
            <Input
              label="Group name"
              placeholder="E.g. Trip to Hawaii, Apartment"
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <Input
              label="Description (optional)"
              placeholder="What is this group for?"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              style={{ minHeight: 90, textAlignVertical: "top" }}
            />
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.foreground }}>
                Currency
              </Text>
              <Pressable
                onPress={() => setShowCurrency((v) => !v)}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  height: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.foreground }}>
                  {selectedCurrency.symbol} {selectedCurrency.code} — {selectedCurrency.name}
                </Text>
                <Feather name={showCurrency ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
              </Pressable>
              {showCurrency ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    backgroundColor: colors.card,
                    overflow: "hidden",
                  }}
                >
                  {COMMON_CURRENCIES.map((c) => {
                    const active = c.code === currency;
                    return (
                      <Pressable
                        key={c.code}
                        onPress={() => {
                          setCurrency(c.code);
                          setCurrencyTouched(true);
                          setShowCurrency(false);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          backgroundColor: active ? colors.accent : "transparent",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ fontFamily: "Inter_400Regular", color: colors.foreground }}>
                          {c.symbol} {c.code} — {c.name}
                        </Text>
                        {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            {error ? (
              <Text style={{ color: colors.destructive }}>{error}</Text>
            ) : null}
          </View>

          <View style={{ gap: 8, marginTop: 24 }}>
            <Button
              title="Create group"
              variant="indigo"
              onPress={onSubmit}
              loading={createGroup.isPending}
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
  scroll: { padding: 16 },
});
