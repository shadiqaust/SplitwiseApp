import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function GroupsStackLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: "Inter_700Bold", color: colors.foreground },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
      }}
    />
  );
}
