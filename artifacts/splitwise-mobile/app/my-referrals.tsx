import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Stack } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { authFetch } from "@/lib/api";

interface MyReferral {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface MyReferralsResponse {
  count: number;
  referrals: MyReferral[];
}

async function fetchMyReferrals(): Promise<MyReferralsResponse> {
  const res = await authFetch("/api/users/me/referrals");
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.json();
}

export default function MyReferralsScreen() {
  const colors = useColors();

  const { data, isLoading } = useQuery({
    queryKey: ["me", "referrals"],
    queryFn: fetchMyReferrals,
  });

  const referrals = data?.referrals ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Your referrals" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary + "26",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="gift" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}
            >
              Your referrals
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              People who joined Splitix using your invite link.
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.card,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary + "26",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="users" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              Total referred users
            </Text>
            <Text
              style={{
                color: colors.foreground,
                fontSize: 22,
                fontFamily: "Inter_700Bold",
                lineHeight: 26,
              }}
            >
              {isLoading ? "—" : (data?.count ?? 0)}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.card,
            overflow: "hidden",
          }}
        >
          {isLoading && (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          {!isLoading && referrals.length === 0 && (
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <Feather name="users" size={28} color={colors.mutedForeground} />
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                No referrals yet
              </Text>
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                Share your invite link from the profile page to start growing your
                Splitix circle.
              </Text>
            </View>
          )}
          {referrals.map((r, idx) => (
            <View
              key={r.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderBottomWidth: idx === referrals.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary + "26" }]}>
                <Text
                  style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}
                >
                  {r.name?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}
                  numberOfLines={1}
                >
                  {r.name}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                  Joined {new Date(r.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {!isLoading && referrals.length > 0 && (
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 11,
              textAlign: "center",
            }}
          >
            {referrals.length}{" "}
            {referrals.length === 1 ? "person has" : "people have"} joined through
            your invite link.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
