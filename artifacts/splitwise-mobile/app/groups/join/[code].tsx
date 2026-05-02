import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import {
  getGetGroupByInviteQueryKey,
  getListGroupsQueryKey,
  useGetGroupByInvite,
  useJoinGroup,
} from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getErrorMessage } from "@/lib/error";

export default function GroupJoinScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();

  const preview = useGetGroupByInvite(code, {
    query: { enabled: Boolean(code), retry: false },
  });

  const join = useJoinGroup();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onJoin = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const group = await join.mutateAsync({ data: { inviteCode: code } });
      await queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetGroupByInviteQueryKey(code) });
      router.replace(`/(tabs)/groups/${group.id}`);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Join group", headerBackTitle: "Back" }} />
      <View style={styles.container}>
        <Card>
          {preview.isLoading ? (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>
                Looking up invite…
              </Text>
            </View>
          ) : preview.error || !preview.data ? (
            <View>
              <Text style={{ color: colors.foreground, fontSize: 16, marginBottom: 8 }}>
                Invite not found
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
                This invite link is invalid or has expired.
              </Text>
            </View>
          ) : (
            <View>
              <View style={styles.row}>
                {preview.data.avatarUrl ? (
                  <Image source={{ uri: preview.data.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }]}>
                    <Feather name="users" size={26} color={colors.accentForeground} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600" }}>
                    {preview.data.name}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 2 }}>
                    {preview.data.memberCount} member
                    {preview.data.memberCount === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
              {preview.data.description ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 14, marginTop: 12 }}>
                  {preview.data.description}
                </Text>
              ) : null}
              {errorMsg ? (
                <Text style={{ color: colors.destructive, fontSize: 13, marginTop: 12 }}>
                  {errorMsg}
                </Text>
              ) : null}
              <View style={{ marginTop: 20 }}>
                {preview.data.alreadyMember ? (
                  <Button
                    title="Open group"
                    onPress={() => router.replace(`/(tabs)/groups/${preview.data!.id}`)}
                  />
                ) : (
                  <Button
                    title={submitting ? "Joining…" : "Join group"}
                    onPress={onJoin}
                    loading={submitting}
                    disabled={submitting}
                  />
                )}
              </View>
            </View>
          )}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "flex-start" },
  row: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 56, height: 56, borderRadius: 12 },
});
