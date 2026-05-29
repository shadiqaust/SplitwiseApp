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
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListGroupsQueryKey,
  useCreateGroup,
  useListCurrencies,
  useGetMe,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";
import { CurrencyDropdown } from "@/components/CurrencyDropdown";

export default function NewGroupScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const createGroup = useCreateGroup();
  const { data: me } = useGetMe();
  const defaultCurrency = me?.defaultCurrency ?? "USD";
  const { data: currenciesData } = useListCurrencies();
  const currencies = currenciesData ?? [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<string>(defaultCurrency);
  const [hasManuallyChangedCurrency, setHasManuallyChangedCurrency] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasManuallyChangedCurrency) {
      setCurrency(defaultCurrency);
    }
  }, [defaultCurrency, hasManuallyChangedCurrency]);

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
            <CurrencyDropdown
              label="Currency"
              options={currencies}
              value={currency}
              onChange={(code) => {
                setCurrency(code);
                setHasManuallyChangedCurrency(true);
              }}
            />
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
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
});
