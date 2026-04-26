import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

export default function ProfileScreen() {
  const colors = useColors();
  const { signOut } = useAuth();
  const { data: me, isLoading } = useGetMe();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
  };

  if (isLoading || !me) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
    >
      <Card style={styles.profileCard}>
        <Avatar name={me.name} url={me.avatarUrl} size={72} />
        <Text style={[styles.name, { color: colors.foreground }]}>
          {me.name}
        </Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>
          {me.email}
        </Text>
      </Card>

      <Button
        title="Log out"
        variant="destructive"
        onPress={handleSignOut}
        fullWidth
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16 },
  profileCard: { alignItems: "center", gap: 8, paddingVertical: 32 },
  name: { fontFamily: "Inter_700Bold", fontSize: 22 },
  email: { fontFamily: "Inter_400Regular", fontSize: 14 },
});
