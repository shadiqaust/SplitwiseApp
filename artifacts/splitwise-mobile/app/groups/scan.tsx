import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Feather } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/useColors";

const INVITE_CODE_RE = /\/groups\/join\/([A-Z0-9]+)/i;

function extractInviteCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(INVITE_CODE_RE);
  if (match) return match[1].toUpperCase();
  // Fall back: treat the raw value as the code itself if it looks like one.
  if (/^[A-Z0-9]{6,16}$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

export default function ScanGroupQRScreen() {
  const colors = useColors();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (handledRef.current) return;
      const code = extractInviteCode(data);
      if (!code) {
        setError("That doesn't look like a Splitix invite code.");
        return;
      }
      handledRef.current = true;
      router.replace(`/groups/join/${code}`);
    },
    [router],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Scan invite QR" }} />

      {!permission ? (
        <View style={styles.center} />
      ) : !permission.granted ? (
        <View style={styles.center}>
          <Feather name="camera-off" size={48} color={colors.mutedForeground} />
          <Text style={[styles.title, { color: colors.foreground }]}>
            Camera access needed
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            We need permission to use your camera so you can scan a group invite
            QR code.
          </Text>
          <View style={{ marginTop: 16, width: "100%" }}>
            <Button title="Grant permission" onPress={requestPermission} fullWidth />
          </View>
        </View>
      ) : (
        <>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onScanned}
          />
          <View pointerEvents="none" style={styles.overlay}>
            <View style={[styles.frame, { borderColor: "#fff" }]} />
            <Text style={styles.hint}>
              Point your camera at a Splitix group QR code
            </Text>
          </View>
          {error ? (
            <View style={styles.errorBar}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                onPress={() => {
                  handledRef.current = false;
                  setError(null);
                }}
                hitSlop={8}
              >
                <Feather name="refresh-cw" size={16} color="#fff" />
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    marginTop: 12,
    textAlign: "center",
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderRadius: 16,
  },
  hint: {
    color: "#fff",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  errorBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 32,
    backgroundColor: "rgba(220, 38, 38, 0.95)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  errorText: {
    color: "#fff",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
});
