import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type Variant = "primary" | "secondary" | "outline" | "destructive" | "ghost";

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  fullWidth,
  icon,
}: Props) {
  const colors = useColors();

  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
        ? colors.secondary
        : variant === "destructive"
          ? colors.destructive
          : "transparent";
  const fg =
    variant === "primary" || variant === "destructive"
      ? "#ffffff"
      : variant === "secondary"
        ? colors.secondaryForeground
        : variant === "outline"
          ? colors.foreground
          : colors.primary;
  const borderWidth = variant === "outline" ? 1 : 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: colors.border,
          borderWidth,
          borderRadius: colors.radius,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "auto",
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.text, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  text: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
