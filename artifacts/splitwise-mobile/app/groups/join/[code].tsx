import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import {
  getGetGroupByInviteQueryKey,
  getGetGroupBalancesQueryKey,
  getGetGroupQueryKey,
  getListGroupsQueryKey,
  useGetGroupByInvite,
  useGetMe,
  useIncludeMemberInPastExpenses,
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

  const me = useGetMe();
  const join = useJoinGroup();
  const includeInPast = useIncludeMemberInPastExpenses();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const goToGroup = (groupId: string) => router.replace(`/(tabs)/groups/${groupId}`);

  const promptIncludeSelfInPast = (groupId: string, myUserId: string) => {
    // Tracks whether the user made an explicit Yes/No choice. On Android,
    // `onDismiss` may fire after button taps as well — this guard ensures
    // dismiss-only navigation never races with the chosen action.
    let didChoose = false;
    Alert.alert(
      "Include yourself in past expenses?",
      "Re-split every existing equal-split expense in this group to include you, and recalculate balances. Expenses with exact or percentage splits will be left unchanged.",
      [
        {
          text: "No, only future expenses",
          style: "cancel",
          onPress: () => {
            didChoose = true;
            goToGroup(groupId);
          },
        },
        {
          text: "Yes, re-split",
          onPress: () => {
            didChoose = true;
            includeInPast.mutate(
              { groupId, data: { userId: myUserId } },
              {
                onSuccess: (result) => {
                  queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
                  queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
                  if (result.updatedCount === 0 && result.totalCount === 0) {
                    Alert.alert("Done", "No past expenses to update.", [
                      { text: "OK", onPress: () => goToGroup(groupId) },
                    ]);
                  } else if (result.updatedCount === 0) {
                    Alert.alert(
                      "Nothing to update",
                      `All ${result.totalCount} expense(s) use exact or percentage splits and were left unchanged.`,
                      [{ text: "OK", onPress: () => goToGroup(groupId) }],
                    );
                  } else {
                    const skipNote = result.skippedNonEqualCount > 0
                      ? `\n\n${result.skippedNonEqualCount} exact/percentage split(s) left unchanged.`
                      : "";
                    Alert.alert(
                      "Updated",
                      `You were added to ${result.updatedCount} past expense(s). Balances recalculated.${skipNote}`,
                      [{ text: "OK", onPress: () => goToGroup(groupId) }],
                    );
                  }
                },
                onError: (err) => {
                  Alert.alert("Failed to update past expenses", getErrorMessage(err), [
                    { text: "OK", onPress: () => goToGroup(groupId) },
                  ]);
                },
              },
            );
          },
        },
      ],
      // cancelable + onDismiss covers Android tap-outside / hardware back so
      // dismiss == "No" deterministically — but only when no explicit choice
      // was made.
      {
        cancelable: true,
        onDismiss: () => {
          if (!didChoose) goToGroup(groupId);
        },
      },
    );
  };

  const onJoin = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const group = await join.mutateAsync({ data: { inviteCode: code } });
      await queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetGroupByInviteQueryKey(code) });
      // Make sure we have the joiner's own DB user id before deciding
      // whether to prompt — falls back to a refetch if `me` hasn't resolved.
      let myUserId = me.data?.id;
      if (!myUserId) {
        try {
          const refetched = await me.refetch();
          myUserId = refetched.data?.id;
        } catch {
          // ignore — handled below
        }
      }
      if (myUserId) {
        promptIncludeSelfInPast(group.id, myUserId);
      } else {
        // Couldn't resolve current user — open the group anyway rather than
        // leaving the user stranded on this screen.
        goToGroup(group.id);
      }
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
                    onPress={() => goToGroup(preview.data!.id)}
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
