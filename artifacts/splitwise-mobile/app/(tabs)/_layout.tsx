import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useGetMe } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useAuth } from "@/lib/auth";

export default function TabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === "web";
  const { user, updateUser } = useAuth();
  const { data: me } = useGetMe();

  // Sync server-side role into the cached auth user so existing sessions
  // (cached before role was added) show the Admin tab without re-login.
  useEffect(() => {
    const serverRole = (me as { role?: "user" | "superadmin" } | undefined)?.role;
    if (serverRole && serverRole !== user?.role) {
      updateUser({ role: serverRole });
    }
  }, [me, user?.role, updateUser]);

  const isSuperadmin = user?.role === "superadmin";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        headerRight: () => <NotificationsBell />,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: {
          fontFamily: "Inter_700Bold",
          color: colors.foreground,
        },
        headerShadowVisible: false,
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          ...(isWeb ? { height: 64 } : {}),
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.background },
            ]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          headerShown: false,
          title: "Groups",
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color }) => (
            <Feather name="user-check" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          // Hide the tab entirely for non-superadmin users.
          href: isSuperadmin ? "/admin" : null,
          tabBarIcon: ({ color }) => (
            <Feather name="shield" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
