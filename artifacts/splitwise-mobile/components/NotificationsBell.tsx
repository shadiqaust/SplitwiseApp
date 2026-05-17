import React from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getListNotificationsQueryKey, useListNotifications } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export function NotificationsBell() {
  const colors = useColors();
  const router = useRouter();
  const { data } = useListNotifications(
    { limit: 30 },
    { query: { queryKey: getListNotificationsQueryKey({ limit: 30 }), refetchInterval: 20000, refetchOnWindowFocus: true } },
  );
  const unread = data?.unreadCount ?? 0;

  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      hitSlop={10}
      style={({ pressed }) => [
        styles.btn,
        { opacity: pressed ? 0.6 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
    >
      <Feather name="bell" size={22} color={colors.foreground} />
      {unread > 0 && (
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.destructive ?? "#ef4444" },
          ]}
        >
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : String(unread)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
});
