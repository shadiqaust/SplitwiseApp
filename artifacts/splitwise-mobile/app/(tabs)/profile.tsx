import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useGetMe, useUpdateMe, getGetMeQueryKey, useListCurrencies } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import {
  getBiometricCapability,
  type BiometricCapability,
} from "@/lib/biometrics";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Switch } from "react-native";

// ─── Predefined avatar presets ────────────────────────────────────────────────
const PRESETS = [
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Alice&size=200", label: "Alice" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Bob&size=200", label: "Bob" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Charlie&size=200", label: "Charlie" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Diana&size=200", label: "Diana" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Alex&size=200", label: "Alex" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Sam&size=200", label: "Sam" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Jordan&size=200", label: "Jordan" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Casey&size=200", label: "Casey" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Felix&size=200", label: "Felix" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Luna&size=200", label: "Luna" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Rider&size=200", label: "Rider" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Max&size=200", label: "Max" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=River&size=200", label: "River" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Sage&size=200", label: "Sage" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Sky&size=200", label: "Sky" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Storm&size=200", label: "Storm" },
];

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    signOut,
    biometricEnabled,
    enableBiometricLogin,
    disableBiometricLogin,
  } = useAuth();
  const [bioCapability, setBioCapability] = useState<BiometricCapability | null>(null);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getBiometricCapability().then((cap) => {
      if (!cancelled) setBioCapability(cap);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleBiometric = async (next: boolean) => {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      if (next) {
        // Re-check capability at toggle time rather than trusting the stale
        // mount-time snapshot — the user may have just enrolled biometrics.
        const cap = await getBiometricCapability();
        setBioCapability(cap);
        if (!cap.available) {
          Alert.alert("Not supported", "This device doesn't support biometric authentication.");
          return;
        }
        if (!cap.enrolled) {
          Alert.alert(
            "Set up biometrics first",
            `Please enrol ${cap.label} in your device settings, then try again.`,
          );
          return;
        }
        await enableBiometricLogin();
      } else {
        await disableBiometricLogin();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[biometric] toggle failed", err);
      Alert.alert("Couldn't update", message || "Try again.");
    } finally {
      setBioBusy(false);
    }
  };
  const { data: me, isLoading } = useGetMe();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();

  // Avatar sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);

  // Profile form state
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [showCurrency, setShowCurrency] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  // Initial population once user data loads. Subsequent re-syncs happen on
  // focus (see useFocusEffect below) so unsaved edits don't survive a
  // tab-switch round trip.
  const initialized = useRef(false);
  useEffect(() => {
    if (me && !initialized.current) {
      setName(me.name);
      setCountry(me.country ?? "");
      setDefaultCurrency(me.defaultCurrency ?? "USD");
      initialized.current = true;
    }
  }, [me]);

  // Whenever the Profile tab regains focus, snap the form back to whatever
  // is currently on the server. This means navigating away with unsaved
  // changes effectively discards them — matching what the user expects when
  // they didn't tap Save. Skipped while a save is in-flight so we don't
  // clobber the optimistic in-progress value.
  useFocusEffect(
    useCallback(() => {
      if (me && !formSaving) {
        setName(me.name);
        setCountry(me.country ?? "");
        setDefaultCurrency(me.defaultCurrency ?? "USD");
      }
    }, [me, formSaving]),
  );

  const { data: currenciesData } = useListCurrencies();
  const currencies = currenciesData ?? [];
  const selectedCurrency =
    currencies.find((c) => c.code === defaultCurrency) ??
    { code: defaultCurrency, symbol: defaultCurrency, name: defaultCurrency };

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
  };

  // ── Invite / share app ────────────────────────────────────────────
  // Build a shareable install link. Uses the configured public install URL
  // when set, otherwise falls back to the deployed web app's domain.
  const inviteUrl = (() => {
    const explicit = process.env.EXPO_PUBLIC_APP_INSTALL_URL as string | undefined;
    const domain = process.env.EXPO_PUBLIC_DOMAIN as string | undefined;
    const base = explicit || (domain ? `https://${domain}` : "https://splitix.app");
    const ref = me?.id ?? "";
    if (!ref) return base;
    try {
      const u = new URL(base);
      u.searchParams.set("ref", ref);
      return u.toString();
    } catch {
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}ref=${encodeURIComponent(ref)}`;
    }
  })();

  const handleInviteFriends = async () => {
    const message =
      `Hey! I'm using Splitix to split bills with friends — it makes settling up effortless. ` +
      `Join me here: ${inviteUrl}`;
    try {
      await Share.share(
        Platform.OS === "ios"
          ? { message, url: inviteUrl }
          : { message, title: "Try Splitix" },
        { dialogTitle: "Invite friends to Splitix" },
      );
    } catch {
      // Share sheet was dismissed or unavailable — copy as a fallback.
      try {
        await Clipboard.setStringAsync(inviteUrl);
        Alert.alert("Link copied", "Your invite link is on the clipboard.");
      } catch {
        Alert.alert("Couldn't share", "Try again in a moment.");
      }
    }
  };

  const handleCopyInvite = async () => {
    try {
      await Clipboard.setStringAsync(inviteUrl);
      Alert.alert("Copied", "Invite link copied to clipboard.");
    } catch {
      Alert.alert("Couldn't copy", "Try again in a moment.");
    }
  };

  const handleSaveProfile = () => {
    if (!name.trim()) {
      Alert.alert("Validation", "Name is required.");
      return;
    }
    setFormSaving(true);
    updateMe.mutate(
      {
        data: {
          name: name.trim(),
          country: country.trim() || null,
          defaultCurrency,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setFormSaving(false);
          Alert.alert("Saved", "Your profile has been updated.");
        },
        onError: () => {
          setFormSaving(false);
          Alert.alert("Error", "Failed to save profile. Please try again.");
        },
      },
    );
  };

  // ── Avatar picker ──────────────────────────────────────────────────────────
  // Downscale + JPEG-compress the picked image so the base64 payload stays
  // small (≈30–80 KB) and well under the API's body-size limit.
  const processPickedAsset = async (uri: string): Promise<string | null> => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 512, height: 512 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!manipulated.base64) return null;
      return `data:image/jpeg;base64,${manipulated.base64}`;
    } catch {
      Alert.alert("Error", "Could not process the selected image.");
      return null;
    }
  };

  const handlePickGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled && result.assets[0].uri) {
      const dataUrl = await processPickedAsset(result.assets[0].uri);
      if (dataUrl) setSelectedUrl(dataUrl);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled && result.assets[0].uri) {
      const dataUrl = await processPickedAsset(result.assets[0].uri);
      if (dataUrl) setSelectedUrl(dataUrl);
    }
  };

  const handleSaveAvatar = () => {
    if (!selectedUrl) return;
    setAvatarSaving(true);
    updateMe.mutate(
      { data: { avatarUrl: selectedUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setAvatarSaving(false);
          setSheetOpen(false);
          setSelectedUrl(null);
        },
        onError: () => {
          setAvatarSaving(false);
          Alert.alert("Error", "Failed to save avatar. Please try again.");
        },
      },
    );
  };

  if (isLoading || !me) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const previewUrl = selectedUrl ?? me.avatarUrl ?? null;

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Avatar card ────────────────────────────────────────── */}
          <Card style={styles.avatarCard}>
            <Pressable onPress={() => setSheetOpen(true)} style={styles.avatarWrap}>
              <Avatar name={me.name} url={me.avatarUrl} size={88} />
              <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
                <Feather name="camera" size={14} color="#fff" />
              </View>
            </Pressable>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{me.name}</Text>
            <Text style={[styles.email, { color: colors.mutedForeground }]}>{me.email}</Text>
            {me.country ? (
              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Feather name="globe" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{me.country}</Text>
                </View>
              </View>
            ) : null}
            <Pressable onPress={() => setSheetOpen(true)}>
              <Text style={[styles.changeAvatarLink, { color: colors.primary }]}>Change avatar</Text>
            </Pressable>
          </Card>

          {/* ── Edit profile form ───────────────────────────────────── */}
          <Card style={styles.formCard}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Edit Profile</Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.foreground }]}>Full Name</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="user" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Country{" "}
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(optional)</Text>
              </Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="globe" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={country}
                  onChangeText={setCountry}
                  placeholder="e.g. France"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.foreground }]}>Default currency</Text>
              <Pressable
                onPress={() => setShowCurrency((v) => !v)}
                style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border, justifyContent: "space-between" }]}
              >
                <Text style={[styles.input, { color: colors.foreground }]}>
                  {selectedCurrency.symbol} {selectedCurrency.code} — {selectedCurrency.name}
                </Text>
                <Feather name={showCurrency ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
              </Pressable>
              {showCurrency ? (
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

            <Button
              title={formSaving ? "Saving…" : "Save Changes"}
              onPress={handleSaveProfile}
              disabled={formSaving}
              fullWidth
            />
          </Card>

          {/* ── Invite friends ─────────────────────────────────────── */}
          <Card style={styles.inviteCard}>
            <View style={styles.inviteHeader}>
              <View style={[styles.inviteIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="gift" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
                  Invite friends
                </Text>
                <Text style={[styles.inviteHint, { color: colors.mutedForeground }]}>
                  Share Splitix so others can split bills with you.
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.inviteLinkBox,
                { backgroundColor: colors.muted, borderColor: colors.border },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.inviteLinkText, { color: colors.foreground }]}
              >
                {inviteUrl}
              </Text>
              <Pressable onPress={handleCopyInvite} hitSlop={10} style={styles.inviteCopyBtn}>
                <Feather name="copy" size={16} color={colors.primary} />
              </Pressable>
            </View>
            <Button
              title="Share invite link"
              onPress={handleInviteFriends}
              fullWidth
            />
            <Pressable
              onPress={() => router.push("/my-referrals" as never)}
              style={{ alignItems: "center", paddingVertical: 4 }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                View who joined through your link →
              </Text>
            </Pressable>
          </Card>

          {/* ── Security ────────────────────────────────────────────── */}
          {bioCapability?.available && (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.inviteIcon, { backgroundColor: colors.primary + "22" }]}>
                  <Feather name="shield" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 2 }]}>
                    Sign in with {bioCapability.label}
                  </Text>
                  <Text style={[styles.inviteHint, { color: colors.mutedForeground }]}>
                    {bioCapability.enrolled
                      ? `Use ${bioCapability.label} on this device to skip the password.`
                      : `Set up ${bioCapability.label} in your device settings to enable.`}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleToggleBiometric}
                  disabled={bioBusy || !bioCapability.enrolled}
                />
              </View>
            </Card>
          )}

          {/* ── Logout ──────────────────────────────────────────────── */}
          <Button title="Log out" variant="destructive" onPress={handleSignOut} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Avatar editor bottom sheet ─────────────────────────────── */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setSheetOpen(false); setSelectedUrl(null); }}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Choose avatar</Text>
              <Pressable onPress={() => { setSheetOpen(false); setSelectedUrl(null); }} hitSlop={12}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              <View style={styles.previewRow}>
                <Avatar name={me.name} url={previewUrl} size={72} />
                <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
                  {selectedUrl ? "Tap Save to apply this avatar." : "Select a cartoon or upload a photo."}
                </Text>
              </View>

              <Text style={[styles.sheetSectionLabel, { color: colors.foreground }]}>Cartoon avatars</Text>
              <FlatList
                data={PRESETS}
                keyExtractor={(item) => item.url}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}
                renderItem={({ item }) => {
                  const isSelected =
                    selectedUrl === item.url || (!selectedUrl && me.avatarUrl === item.url);
                  return (
                    <Pressable onPress={() => setSelectedUrl(item.url)} style={styles.presetItem}>
                      <Image
                        source={{ uri: item.url }}
                        style={[
                          styles.presetImg,
                          { borderColor: isSelected ? colors.primary : colors.border },
                        ]}
                      />
                      {isSelected && (
                        <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={10} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                  );
                }}
              />

              <Text style={[styles.sheetSectionLabel, { color: colors.foreground }]}>Upload photo</Text>
              <View style={styles.uploadRow}>
                <Pressable
                  onPress={handlePickGallery}
                  style={[styles.uploadBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <Feather name="image" size={22} color={colors.mutedForeground} />
                  <Text style={[styles.uploadBtnText, { color: colors.foreground }]}>Gallery</Text>
                </Pressable>
                <Pressable
                  onPress={handleTakePhoto}
                  style={[styles.uploadBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <Feather name="camera" size={22} color={colors.mutedForeground} />
                  <Text style={[styles.uploadBtnText, { color: colors.foreground }]}>Camera</Text>
                </Pressable>
              </View>

              {selectedUrl?.startsWith("data:") && (
                <View style={styles.uploadedPreview}>
                  <Image source={{ uri: selectedUrl }} style={styles.uploadedImg} />
                  <Text style={[styles.uploadedLabel, { color: colors.mutedForeground }]}>Photo selected</Text>
                </View>
              )}
            </ScrollView>

            <View style={[styles.sheetFooter, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <Button title="Cancel" variant="outline" onPress={() => { setSheetOpen(false); setSelectedUrl(null); }} />
              <Button title={avatarSaving ? "Saving…" : "Save"} onPress={handleSaveAvatar} disabled={!selectedUrl || avatarSaving} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 48 },

  // Avatar card
  avatarCard: { alignItems: "center", gap: 6, paddingVertical: 28 },
  avatarWrap: { position: "relative", marginBottom: 4 },
  editBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  displayName: { fontFamily: "Inter_700Bold", fontSize: 20 },
  email: { fontFamily: "Inter_400Regular", fontSize: 13 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  changeAvatarLink: { fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 6 },

  // Invite card
  inviteCard: { gap: 12, padding: 16 },
  inviteHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteHint: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  inviteLinkBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  inviteLinkText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12 },
  inviteCopyBtn: { padding: 4 },

  // Form card
  formCard: { gap: 16, padding: 16 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 4 },
  field: { gap: 6 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15 },

  // Avatar sheet
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  sheetContent: { padding: 16, gap: 12 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 4 },
  previewHint: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  sheetSectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  presetRow: { gap: 10, paddingVertical: 4 },
  presetItem: { position: "relative" },
  presetImg: { width: 72, height: 72, borderRadius: 12, borderWidth: 2 },
  checkBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadRow: { flexDirection: "row", gap: 12 },
  uploadBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  uploadBtnText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  uploadedPreview: { alignItems: "center", gap: 8, paddingVertical: 4 },
  uploadedImg: { width: 80, height: 80, borderRadius: 40 },
  uploadedLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  sheetFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
});
