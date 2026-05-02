import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(s: string): Date {
  if (s) {
    const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
    if (y && m && d) return new Date(y, m - 1, d);
  }
  return new Date();
}

function formatDisplay(s: string): string {
  const d = parseIsoDate(s);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const colors = useColors();
  const [showIosPicker, setShowIosPicker] = useState(false);
  const current = parseIsoDate(value);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "set" && selected) onChange(toIsoDate(selected));
    setShowIosPicker(false);
  };

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onChange: (event, selected) => {
          if (event.type === "set" && selected) onChange(toIsoDate(selected));
        },
      });
    } else {
      setShowIosPicker((s) => !s);
    }
  };

  return (
    <View>
      <Pressable
        onPress={open}
        style={[
          styles.field,
          { borderColor: colors.border, backgroundColor: colors.muted },
        ]}
      >
        <Text style={[styles.text, { color: colors.foreground }]}>
          {formatDisplay(value)}
        </Text>
        <Feather name="calendar" size={16} color={colors.mutedForeground} />
      </Pressable>
      {Platform.OS === "ios" && showIosPicker && (
        <View style={{ marginTop: 8, alignItems: "flex-start" }}>
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            onChange={handleChange}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  text: { fontFamily: "Inter_400Regular", fontSize: 14 },
});
