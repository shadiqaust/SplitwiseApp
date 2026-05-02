import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";

const ALLOWED_HOST_SUFFIXES = [".replit.app", ".replit.dev", ".repl.co"];
const CONFIGURED_HOST = (process.env.EXPO_PUBLIC_DOMAIN ?? "")
  .trim()
  .toLowerCase();

function isTrustedSplitixHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (CONFIGURED_HOST && h === CONFIGURED_HOST) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

export function extractInviteCode(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // 1. Splitix mobile deep-link scheme
  const schemeMatch = trimmed.match(
    /^splitwise-mobile:\/\/groups\/join\/([A-Za-z0-9]+)\/?$/i,
  );
  if (schemeMatch) return schemeMatch[1].toUpperCase();

  // 2. Trusted https://<splitix-host>/groups/join/<CODE>
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (!isTrustedSplitixHost(url.hostname)) return null;
      const pathMatch = url.pathname.match(/^\/groups\/join\/([A-Za-z0-9]+)\/?$/);
      if (pathMatch) return pathMatch[1].toUpperCase();
      return null;
    } catch {
      return null;
    }
  }

  // 3. Bare invite code (4-12 alphanumeric chars)
  if (/^[A-Za-z0-9]{4,12}$/.test(trimmed)) return trimmed.toUpperCase();

  return null;
}

export default function ScanGroupQRScreen() {
  const colors = useColors();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  const onScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (handledRef.current) return;
      const code = extractInviteCode(result.data);
      if (!code) {
        if (!error) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          setError("That QR code isn't a Splitix invite. Try another one.");
          setTimeout(() => setError(null), 2500);
        }
        return;
      }
      handledRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/groups/join/${code}`);
    },
    [router, error],
  );

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Scan QR" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <Stack.Screen options={{ title: "Scan QR" }} />
        <Feather name="camera-off" size={48} color={colors.mutedForeground} />
        <Text
          style={{
            color: colors.foreground,
            fontSize: 17,
            fontWeight: "600",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          Camera access needed
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 14,
            marginTop: 8,
            textAlign: "center",
          }}
        >
          Splitix needs camera permission so you can scan a group invite QR code.
        </Text>
        <View style={{ marginTop: 24, width: "100%", maxWidth: 320 }}>
          <Button
            title={permission.canAskAgain ? "Allow camera" : "Open settings"}
            onPress={async () => {
              if (permission.canAskAgain) {
                await requestPermission();
              } else {
                const Linking = await import("expo-linking");
                Linking.openSettings();
              }
            }}
            fullWidth
          />
          <View style={{ height: 8 }} />
          <Button
            title="Cancel"
            variant="outline"
            onPress={() => router.back()}
            fullWidth
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen
        options={{
          title: "Scan QR",
          headerStyle: { backgroundColor: "#000" },
          headerTintColor: "#fff",
        }}
      />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onScanned}
      />

      {/* Targeting overlay */}
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        <Text style={styles.hint}>
          Point your camera at a Splitix group QR code
        </Text>
      </View>

      {error ? (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.bottomBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.cancelBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="x" size={20} color="#fff" />
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const FRAME = 260;
const CORNER = 28;
const BORDER = 3;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinder: {
    width: FRAME,
    height: FRAME,
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: "#fff",
  },
  tl: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 8 },
  hint: {
    color: "#fff",
    marginTop: 24,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  toast: {
    position: "absolute",
    bottom: 140,
    left: 24,
    right: 24,
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  toastText: { color: "#fff", textAlign: "center", fontSize: 14 },
  bottomBar: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  cancelText: { color: "#fff", fontSize: 15, fontWeight: "500" },
});
