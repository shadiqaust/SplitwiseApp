import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

// ─── Predefined avatar presets ────────────────────────────────────────────────
const PRESETS = [
  // Avataaars — cartoon people
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Alice&size=200", label: "Alice" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Bob&size=200", label: "Bob" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Charlie&size=200", label: "Charlie" },
  { url: "https://api.dicebear.com/9.x/avataaars/png?seed=Diana&size=200", label: "Diana" },
  // Fun emoji
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Alex&size=200", label: "Alex" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Sam&size=200", label: "Sam" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Jordan&size=200", label: "Jordan" },
  { url: "https://api.dicebear.com/9.x/fun-emoji/png?seed=Casey&size=200", label: "Casey" },
  // Adventurer
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Felix&size=200", label: "Felix" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Luna&size=200", label: "Luna" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Rider&size=200", label: "Rider" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=Max&size=200", label: "Max" },
  // Pixel art
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=River&size=200", label: "River" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Sage&size=200", label: "Sage" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Sky&size=200", label: "Sky" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=Storm&size=200", label: "Storm" },
];

export default function ProfileScreen() {
  const colors = useColors();
  const { signOut } = useAuth();
  const { data: me, isLoading } = useGetMe();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
  };

  const previewUrl = selectedUrl ?? me?.avatarUrl ?? null;

  const handlePickGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setSelectedUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
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
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setSelectedUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSave = () => {
    if (!selectedUrl) return;
    setSaving(true);
    updateMe.mutate(
      { data: { avatarUrl: selectedUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setSaving(false);
          setSheetOpen(false);
          setSelectedUrl(null);
        },
        onError: () => {
          setSaving(false);
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

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
      >
        <Card style={styles.profileCard}>
          {/* Avatar with edit overlay */}
          <Pressable onPress={() => setSheetOpen(true)} style={styles.avatarWrap}>
            <Avatar name={me.name} url={me.avatarUrl} size={88} />
            <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={14} color="#fff" />
            </View>
          </Pressable>

          <Text style={[styles.name, { color: colors.foreground }]}>{me.name}</Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]}>{me.email}</Text>

          <Pressable onPress={() => setSheetOpen(true)}>
            <Text style={[styles.changeLink, { color: colors.primary }]}>Change avatar</Text>
          </Pressable>
        </Card>

        <Button title="Log out" variant="destructive" onPress={handleSignOut} fullWidth />
      </ScrollView>

      {/* Avatar editor sheet */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setSheetOpen(false); setSelectedUrl(null); }}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Choose avatar</Text>
              <Pressable onPress={() => { setSheetOpen(false); setSelectedUrl(null); }} hitSlop={12}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {/* Preview */}
              <View style={styles.previewRow}>
                <Avatar name={me.name} url={previewUrl} size={72} />
                <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
                  {selectedUrl ? "Tap Save to apply this avatar." : "Select an avatar or upload a photo."}
                </Text>
              </View>

              {/* Cartoon avatars */}
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Cartoon avatars</Text>
              <FlatList
                data={PRESETS}
                keyExtractor={(item) => item.url}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}
                renderItem={({ item }) => {
                  const isSelected = selectedUrl === item.url || (!selectedUrl && me.avatarUrl === item.url);
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

              {/* Upload section */}
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Upload photo</Text>
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

            {/* Footer actions */}
            <View style={[styles.sheetFooter, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => { setSheetOpen(false); setSelectedUrl(null); }}
              />
              <Button
                title={saving ? "Saving…" : "Save"}
                onPress={handleSave}
                disabled={!selectedUrl || saving}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  profileCard: { alignItems: "center", gap: 8, paddingVertical: 32 },
  avatarWrap: { position: "relative" },
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
  name: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 4 },
  email: { fontFamily: "Inter_400Regular", fontSize: 14 },
  changeLink: { fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%", paddingBottom: 0 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  sheetContent: { padding: 16, gap: 16 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 },
  previewHint: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 8 },
  presetRow: { gap: 10, paddingVertical: 8 },
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
  uploadRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  uploadBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  uploadBtnText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  uploadedPreview: { alignItems: "center", gap: 8, paddingVertical: 8 },
  uploadedImg: { width: 80, height: 80, borderRadius: 40 },
  uploadedLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  sheetFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
});
