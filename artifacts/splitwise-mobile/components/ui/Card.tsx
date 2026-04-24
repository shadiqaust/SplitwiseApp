import { StyleSheet, View, ViewProps } from "react-native";
import { useColors } from "@/hooks/useColors";

export function Card({ style, children, ...props }: ViewProps) {
  const colors = useColors();
  return (
    <View
      {...props}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
  },
});
