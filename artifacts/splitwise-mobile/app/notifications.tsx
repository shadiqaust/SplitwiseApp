import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type Notification,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  getPushStatus,
  registerForPushNotificationsAsync,
  subscribePushStatus,
  type PushStatus,
} from "@/lib/push";
import { useAuth } from "@/lib/auth";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function targetPath(n: Notification): string | null {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const expenseId = typeof data.expenseId === "string" ? data.expenseId : null;
  const groupId = typeof data.groupId === "string" ? data.groupId : null;
  const paymentId = typeof data.paymentId === "string" ? data.paymentId : null;
  const actorUserId = typeof data.actorUserId === "string" ? data.actorUserId : null;
  if (expenseId) return `/expenses/${expenseId}`;
  if (groupId) return `/groups/${groupId}`;
  if (paymentId && actorUserId) return `/friends/${actorUserId}`;
  return null;
}

function statusLabel(code: PushStatus["code"]): { text: string; tone: "ok" | "warn" | "error" | "muted" } {
  switch (code) {
    case "ok":
      return { text: "Push notifications enabled", tone: "ok" };
    case "registering":
      return { text: "Registering for push…", tone: "muted" };
    case "idle":
      return { text: "Push not registered yet", tone: "muted" };
    case "web-unsupported":
      return { text: "Push unavailable on web", tone: "muted" };
    case "simulator-unsupported":
      return { text: "Push unavailable on simulator", tone: "warn" };
    case "expo-go-unsupported":
      return { text: "Push unsupported in Expo Go (need dev build)", tone: "error" };
    case "permission-denied":
      return { text: "Notification permission denied", tone: "error" };
    case "no-project-id":
      return { text: "Missing EAS projectId in app.json", tone: "error" };
    case "token-error":
      return { text: "Could not get Expo push token", tone: "error" };
    case "register-failed":
      return { text: "Backend rejected device token", tone: "error" };
  }
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isFetching, refetch } = useListNotifications({ limit: 50 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const { isSignedIn } = useAuth();
  const [pushStatus, setPushStatus] = useState<PushStatus>(() => getPushStatus());
  useEffect(() => subscribePushStatus(setPushStatus), []);

  const apiBaseUrl =
    (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ?? "";
  const retryRegister = () => {
    if (apiBaseUrl) void registerForPushNotificationsAsync(apiBaseUrl);
  };

  const lbl = statusLabel(pushStatus.code);
  const toneColor =
    lbl.tone === "ok"
      ? "#16a34a"
      : lbl.tone === "warn"
      ? "#d97706"
      : lbl.tone === "error"
      ? "#dc2626"
      : colors.mutedForeground;

  const list = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications",
    });

  const onPressItem = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await markRead.mutateAsync({ notificationId: n.id });
        invalidate();
      } catch {
        // best-effort
      }
    }
    const path = targetPath(n);
    if (path) router.push(path as never);
  };

  const onMarkAll = async () => {
    try {
      await markAll.mutateAsync();
      invalidate();
    } catch {
      // best-effort
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: {
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
          },
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={onMarkAll} hitSlop={10} style={{ paddingRight: 12 }}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                  Mark all read
                </Text>
              </Pressable>
            ) : null,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {isSignedIn && pushStatus.code !== "ok" && (
          <View
            style={[
              styles.statusCard,
              { backgroundColor: colors.muted ?? colors.background, borderColor: colors.border },
            ]}
          >
            <View style={[styles.statusDot, { backgroundColor: toneColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>{lbl.text}</Text>
              {pushStatus.detail && (
                <Text style={[styles.statusDetail, { color: colors.mutedForeground }]}>
                  {pushStatus.detail}
                </Text>
              )}
            </View>
            <Pressable onPress={retryRegister} hitSlop={8} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </Pressable>
          </View>
        )}
        <FlatList
          data={list}
          keyExtractor={(n) => n.id}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
          }
          contentContainerStyle={list.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              You're all caught up.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPressItem(item)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: item.readAt
                    ? colors.background
                    : (colors.primaryMuted ?? colors.muted ?? colors.background),
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: item.readAt ? "transparent" : colors.primary },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.title, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text
                  style={[styles.body, { color: colors.mutedForeground }]}
                  numberOfLines={2}
                >
                  {item.body}
                </Text>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {timeAgo(item.createdAt)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  empty: { fontFamily: "Inter_500Medium", fontSize: 14 },
  row: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  body: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  time: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 4 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  statusDetail: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  retryBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
