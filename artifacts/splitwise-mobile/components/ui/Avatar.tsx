import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useColors } from "@/hooks/useColors";
import { getInitials } from "@/lib/format";
import { resolvePresetSource } from "@/lib/avatarPresets";

interface Props {
  name: string;
  url?: string | null;
  size?: number;
}

export function Avatar({ name, url, size = 40 }: Props) {
  const colors = useColors();
  if (url) {
    // `preset:<id>` markers resolve to a locally-bundled image so we don't
    // hit any external host. Anything else (http(s), data:, file:) flows
    // through expo-image's URI source.
    const presetSource = resolvePresetSource(url);
    return (
      <Image
        source={presetSource ?? { uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accent,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: colors.accentForeground, fontSize: size * 0.4 },
        ]}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  text: { fontFamily: "Inter_600SemiBold" },
});
