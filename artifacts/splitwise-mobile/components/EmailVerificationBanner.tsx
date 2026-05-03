import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useGetMe } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/api";

export function EmailVerificationBanner() {
  const colors = useColors();
  const { user, updateUser } = useAuth();
  const { data: me } = useGetMe();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const verifiedAt =
    (me as { emailVerifiedAt?: string | null } | undefined)?.emailVerifiedAt ??
    user?.emailVerifiedAt ??
    null;

  if (!user || verifiedAt || dismissed) return null;

  async function handleResend() {
    setSending(true);
    setMessage(null);
    setIsError(false);
    try {
      const res = await authFetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        alreadyVerified?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      if (data.alreadyVerified) {
        updateUser({ emailVerifiedAt: new Date().toISOString() });
        setMessage("Your email is already verified.");
      } else {
        setMessage("Verification email sent. Check your inbox.");
      }
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: "#fef3c7",
          borderColor: "#fcd34d",
        },
      ]}
    >
      <Feather name="mail" size={18} color="#78350f" style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[styles.title, { color: "#78350f" }]}>Verify your email</Text>
        <Text style={[styles.body, { color: "#78350f" }]} numberOfLines={3}>
          We sent a link to {user.email}. You can browse, but creating expenses,
          payments, groups or friends is paused until you confirm.
        </Text>
        {message ? (
          <Text
            style={[
              styles.body,
              { color: isError ? colors.destructive : "#065f46" },
            ]}
          >
            {message}
          </Text>
        ) : null}
        <Pressable
          onPress={handleResend}
          disabled={sending}
          style={({ pressed }) => [
            styles.btn,
            {
              borderColor: "#92400e",
              opacity: pressed || sending ? 0.7 : 1,
            },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#78350f" />
          ) : (
            <Text style={[styles.btnText, { color: "#78350f" }]}>Resend email</Text>
          )}
        </Pressable>
      </View>
      <Pressable onPress={() => setDismissed(true)} hitSlop={10}>
        <Feather name="x" size={16} color="#78350f" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  body: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  btn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  btnText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
