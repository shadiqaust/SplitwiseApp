import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

export function CurrencyDropdown({
  options,
  value,
  onChange,
  label,
}: {
  options: CurrencyOption[];
  value: string;
  onChange: (code: string) => void;
  label?: string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((c) => c.code === value) ?? options[0];

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.foreground }}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.foreground }}>
          {selected?.symbol} {selected?.code} — {selected?.name}
        </Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </Pressable>
      {open ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            backgroundColor: colors.muted,
            overflow: "hidden",
            maxHeight: 240,
          }}
        >
          <ScrollView nestedScrollEnabled>
            {options.map((c) => {
              const active = c.code === value;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: active ? colors.accent : "transparent",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.foreground }}>
                    {c.symbol} {c.code} — {c.name}
                  </Text>
                  {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
