import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

type Mode = "sign-in" | "sign-up";

export default function SignInScreen() {
  const colors = useColors();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!name.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signUp(name.trim(), email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign up");
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
            Splitix
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

          {error ? (
            <Text style={{ color: colors.destructive, fontSize: 14 }}>
              {error}
            </Text>
          ) : null}

          <Button
            title={mode === "sign-in" ? "Log in" : "Create account"}
            onPress={mode === "sign-in" ? handleSignIn : handleSignUp}
            loading={loading}
            fullWidth
          />

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
