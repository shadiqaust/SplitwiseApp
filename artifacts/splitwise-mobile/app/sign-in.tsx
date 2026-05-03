import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import {
  getBiometricCapability,
  hasOfferedBiometricSetup,
  markBiometricSetupOffered,
  type BiometricCapability,
} from "@/lib/biometrics";
import * as SecureStore from "expo-secure-store";
import { useListCurrencies } from "@workspace/api-client-react";

type Mode = "sign-in" | "sign-up";

export default function SignInScreen() {
  const colors = useColors();
  const {
    signIn,
    signUp,
    biometricEnabled,
    signInWithBiometrics,
    enableBiometricLogin,
  } = useAuth();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [showCurrency, setShowCurrency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioCapability, setBioCapability] = useState<BiometricCapability | null>(null);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getBiometricCapability().then((cap) => {
      if (!cancelled) setBioCapability(cap);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-prompt biometric unlock once on mount when the device supports it
  // and the user previously opted in. Silent-fail so users can still type a
  // password if they cancel the prompt.
  useEffect(() => {
    if (!biometricEnabled) return;
    if (!bioCapability?.available || !bioCapability.enrolled) return;
    void signInWithBiometrics().catch(() => {
      // Cancelled / failed — leave the form visible.
    });
    // Only run once per cap discovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricEnabled, bioCapability?.available, bioCapability?.enrolled]);

  const bioIcon: React.ComponentProps<typeof Feather>["name"] =
    bioCapability?.kinds.includes("face") ? "smile" : "unlock";

  const offerBiometricSetup = async () => {
    if (!bioCapability?.available) return;
    if (!bioCapability.enrolled) return; // No biometrics enrolled on the device — nothing to offer.
    if (biometricEnabled) return; // Already on.

    // Look up the freshly-signed-in user's id (the React state from useAuth
    // hasn't propagated to this closure yet) so we can suppress the prompt
    // for users who've already seen it once.
    let userId = "";
    if (Platform.OS !== "web") {
      const stored = await SecureStore.getItemAsync("sw_auth_user");
      if (stored) {
        try {
          userId = (JSON.parse(stored) as { id?: string }).id ?? "";
        } catch {
          userId = "";
        }
      }
    }
    if (userId && (await hasOfferedBiometricSetup(userId))) {
      // Already prompted this user — respect their previous choice.
      return;
    }

    await new Promise<void>((resolve) => {
      Alert.alert(
        `Use ${bioCapability.label} next time?`,
        `Sign in faster with ${bioCapability.label} on this device. You can turn it on anytime in Profile.`,
        [
          { text: "Not now", style: "cancel", onPress: () => resolve() },
          {
            text: "Enable",
            onPress: async () => {
              try {
                await enableBiometricLogin();
              } catch (err) {
                Alert.alert(
                  "Couldn't enable",
                  err instanceof Error ? err.message : "Try again from Profile.",
                );
              } finally {
                resolve();
              }
            },
          },
        ],
      );
    });
    // Record the offer regardless of accept/decline so we don't nag again.
    if (userId) {
      await markBiometricSetupOffered(userId);
    }
  };

  const { data: currenciesData } = useListCurrencies();
  const currencies = currenciesData ?? [];
  const selectedCurrency =
    currencies.find((c) => c.code === defaultCurrency) ??
    { code: defaultCurrency, symbol: defaultCurrency, name: defaultCurrency };

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      await offerBiometricSetup();
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
      await signUp(name.trim(), email, password, defaultCurrency);
      await offerBiometricSetup();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricSignIn = async () => {
    setError(null);
    setBioLoading(true);
    try {
      await signInWithBiometrics();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Biometric sign-in failed");
    } finally {
      setBioLoading(false);
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

          {mode === "sign-up" ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.foreground }}>
                Default currency
              </Text>
              <Pressable
                onPress={() => setShowCurrency((v) => !v)}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  height: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ fontFamily: "Inter_400Regular", color: colors.foreground }}>
                  {selectedCurrency.symbol} {selectedCurrency.code} — {selectedCurrency.name}
                </Text>
                <Feather name={showCurrency ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
              </Pressable>
              {showCurrency ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    backgroundColor: colors.card,
                    overflow: "hidden",
                    maxHeight: 240,
                  }}
                >
                  <ScrollView nestedScrollEnabled>
                    {currencies.map((c) => {
                      const active = c.code === defaultCurrency;
                      return (
                        <Pressable
                          key={c.code}
                          onPress={() => {
                            setDefaultCurrency(c.code);
                            setShowCurrency(false);
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
                          <Text style={{ fontFamily: "Inter_400Regular", color: colors.foreground }}>
                            {c.symbol} {c.code} — {c.name}
                          </Text>
                          {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>
                Used as the default when you create new groups.
              </Text>
            </View>
          ) : null}

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

          {mode === "sign-in" && biometricEnabled && bioCapability?.available && bioCapability.enrolled && (
            <Pressable
              onPress={handleBiometricSignIn}
              disabled={bioLoading || loading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: bioLoading || loading ? 0.5 : 1,
              }}
              accessibilityLabel={`Sign in with ${bioCapability.label}`}
            >
              <Feather name={bioIcon} size={18} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                {bioLoading ? "Authenticating…" : `Sign in with ${bioCapability.label}`}
              </Text>
            </Pressable>
          )}

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
