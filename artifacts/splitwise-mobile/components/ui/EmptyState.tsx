import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Props {
  icon?: React.ComponentProps<typeof Feather>["name"];
  title: string;
  message?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "inbox", title, message, action }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.iconBubble,
          { backgroundColor: colors.accent, borderRadius: 100 },
        ]}
      >
        <Feather name={icon} size={28} color={colors.accentForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {message ? (
        <Text style={[styles.msg, { color: colors.mutedForeground }]}>
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  iconBubble: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 18, textAlign: "center" },
  msg: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
});
