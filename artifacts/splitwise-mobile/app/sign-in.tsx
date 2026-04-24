import { useState } from "react";
import { getErrorMessage } from "@/lib/error";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSignIn, useSignUp } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";

type Mode = "sign-in" | "sign-up" | "verify";

export default function SignInScreen() {
  const colors = useColors();
  const { signIn, setActive: setActiveSignIn } = useSignIn();
  const { signUp, setActive: setActiveSignUp } = useSignUp();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!signIn || !setActiveSignIn) return;
    setError(null);
    setLoading(true);
    try {
      const attempt = await signIn.create({ identifier: email, password });
      if (attempt.status === "complete") {
        await setActiveSignIn({ session: attempt.createdSessionId });
      } else {
        setError("Sign-in incomplete");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to sign in"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signUp) return;
    setError(null);
    setLoading(true);
    try {
      const [first, ...rest] = name.trim().split(/\s+/);
      await signUp.create({
        emailAddress: email,
        password,
        firstName: first || undefined,
        lastName: rest.join(" ") || undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setMode("verify");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to sign up"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signUp || !setActiveSignUp) return;
    setError(null);
    setLoading(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status === "complete") {
        await setActiveSignUp({ session: attempt.createdSessionId });
      } else {
        setError("Verification incomplete");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Invalid code"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View
            style={[
              styles.brandIcon,
              { backgroundColor: colors.primary, borderRadius: colors.radius },
            ]}
          >
            <Feather name="dollar-sign" size={28} color="#fff" />
          </View>
          <Text style={[styles.brandTitle, { color: colors.foreground }]}>
            Splitwise
          </Text>
          <Text style={[styles.brandTag, { color: colors.mutedForeground }]}>
            Less stress when sharing expenses
          </Text>
        </View>

        <View style={styles.form}>
          {mode === "sign-up" ? (
            <Input
              label="Full name"
              placeholder="Jane Doe"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />
          ) : null}

          {mode !== "verify" ? (
            <>
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          ) : (
            <Input
              label="Verification code"
              placeholder="Enter the 6-digit code from your email"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
            />
          )}

          {error ? (
            <Text style={{ color: colors.destructive, fontSize: 14 }}>
              {error}
            </Text>
          ) : null}

          <Button
            title={
              mode === "sign-in"
                ? "Log in"
                : mode === "sign-up"
                  ? "Create account"
                  : "Verify email"
            }
            onPress={
              mode === "sign-in"
                ? handleSignIn
                : mode === "sign-up"
                  ? handleSignUp
                  : handleVerify
            }
            loading={loading}
            fullWidth
          />

          {mode !== "verify" ? (
            <Button
              title={
                mode === "sign-in"
                  ? "Need an account? Sign up"
                  : "Already have an account? Log in"
              }
              variant="ghost"
              onPress={() => {
                setError(null);
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              }}
              fullWidth
            />
          ) : (
            <Button
              title="Back"
              variant="ghost"
              onPress={() => {
                setError(null);
                setMode("sign-up");
              }}
              fullWidth
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 24, justifyContent: "center", gap: 32 },
  brand: { alignItems: "center", gap: 12 },
  brandIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: { fontFamily: "Inter_700Bold", fontSize: 28 },
  brandTag: { fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center" },
  form: { gap: 16 },
});
