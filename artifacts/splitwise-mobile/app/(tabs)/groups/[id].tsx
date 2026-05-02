import { useCallback, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetGroupBalancesQueryKey,
  getGetGroupQueryKey,
  getListGroupsQueryKey,
  useAddGroupMember,
  useGetGroup,
  useGetGroupBalances,
  useGetMe,
  useIncludeMemberInPastExpenses,
  useListExpenses,
  useListPayments,
  useUpdateGroup,
  type Payment,
} from "@workspace/api-client-react";
import { authFetch } from "@/lib/api";
import { getCategoryIcon } from "@/lib/expenseCategories";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PaymentDetailModal } from "@/components/PaymentDetailModal";
import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatDate } from "@/lib/format";

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

const GROUP_PRESETS = [
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=alpha&size=200", label: "Alpha" },
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=beta&size=200", label: "Beta" },
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=gamma&size=200", label: "Gamma" },
  { url: "https://api.dicebear.com/9.x/bottts/png?seed=delta&size=200", label: "Delta" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=hike&size=200", label: "Hike" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=trip&size=200", label: "Trip" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=squad&size=200", label: "Squad" },
  { url: "https://api.dicebear.com/9.x/thumbs/png?seed=crew&size=200", label: "Crew" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=house&size=200", label: "House" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=flat&size=200", label: "Flat" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=family&size=200", label: "Family" },
  { url: "https://api.dicebear.com/9.x/pixel-art/png?seed=work&size=200", label: "Work" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=voyage&size=200", label: "Voyage" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=explorer&size=200", label: "Explorer" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=nomad&size=200", label: "Nomad" },
  { url: "https://api.dicebear.com/9.x/adventurer/png?seed=trailblazer&size=200", label: "Trailblazer" },
];

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE_URL = domain ? `https://${domain}` : "";

// authFetch is provided by lib/api.ts (shared, with 401 → auto-logout).

interface UserResult {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isFriend: boolean;
}

type Tab = "expenses" | "balances";

export default function GroupDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const groupId = params.id!;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("expenses");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [filterMemberId, setFilterMemberId] = useState<string | "all">("all");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "7d" | "30d">("all");
  const [profileMember, setProfileMember] = useState<{ userId: string; user: { name: string; email: string; avatarUrl: string | null } } | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  // Polling cadence + background-polling are configured globally on the
  // QueryClient (5s, runs in background).
  const me = useGetMe();
  const group = useGetGroup(groupId);
  const groupCurrency = group.data?.currency ?? "USD";
  const expenses = useListExpenses(groupId);
  const payments = useListPayments(groupId);
  const balances = useGetGroupBalances(groupId);
  const addMember = useAddGroupMember();
  const includeInPast = useIncludeMemberInPastExpenses();
  const updateGroup = useUpdateGroup();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([group.refetch(), expenses.refetch(), payments.refetch(), balances.refetch()]);
    setIsRefreshing(false);
  }, [group, expenses, payments, balances]);

  const { data: searchResults = [], isFetching: isSearching } = useQuery<UserResult[]>({
    queryKey: ["add-member-search", memberSearch, groupId],
    queryFn: async () => {
      const params = new URLSearchParams({ excludeGroupId: String(groupId) });
      if (memberSearch.trim()) params.set("q", memberSearch.trim());
      const res = await authFetch(`/api/users/search?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: showAddModal,
    staleTime: 0,
    refetchInterval: false, // search input — don't poll
  });

  const promptIncludeInPastExpenses = (userId: string, name: string) => {
    Alert.alert(
      `Include ${name} in past expenses?`,
      `Re-split every existing equal-split expense in this group to include ${name}, and recalculate balances. Expenses with exact or percentage splits will be left unchanged.`,
      [
        { text: "No, only future expenses", style: "cancel" },
        {
          text: "Yes, re-split",
          onPress: () => {
            includeInPast.mutate(
              { groupId, data: { userId } },
              {
                onSuccess: (result) => {
                  queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
                  queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
                  if (result.updatedCount === 0 && result.totalCount === 0) {
                    Alert.alert("Done", "No past expenses to update.");
                  } else if (result.updatedCount === 0) {
                    Alert.alert(
                      "Nothing to update",
                      `All ${result.totalCount} expense(s) use exact or percentage splits and were left unchanged.`,
                    );
                  } else {
                    const skipNote = result.skippedNonEqualCount > 0
                      ? `\n\n${result.skippedNonEqualCount} exact/percentage split(s) left unchanged.`
                      : "";
                    Alert.alert(
                      "Updated",
                      `${name} added to ${result.updatedCount} past expense(s). Balances recalculated.${skipNote}`,
                    );
                  }
                },
                onError: (err) => {
                  Alert.alert("Failed to update past expenses", getErrorMessage(err));
                },
              },
            );
          },
        },
      ],
    );
  };

  const onAddMember = (user: UserResult) => {
    setAddingUserId(user.id);
    addMember.mutate(
      { groupId, data: { userId: user.id } },
      {
        onSuccess: () => {
          setAddingUserId(null);
          setShowAddModal(false);
          setMemberSearch("");
          queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
          queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
          queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          promptIncludeInPastExpenses(user.id, user.name);
        },
        onError: () => {
          setAddingUserId(null);
        },
      },
    );
  };

  const handlePickGroupAvatar = async () => {
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
    if (result.canceled || !result.assets[0].uri) return;
    try {
      // Downscale + JPEG-compress so the base64 payload stays well under the
      // API's body-size limit (≈30–80 KB instead of multiple MB).
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (manipulated.base64) {
        setSelectedAvatarUrl(`data:image/jpeg;base64,${manipulated.base64}`);
      }
    } catch {
      Alert.alert("Error", "Could not process the selected image.");
    }
  };

  const openEditSheet = () => {
    if (!group.data) return;
    setEditName(group.data.name);
    setEditDescription(group.data.description ?? "");
    setShowEditSheet(true);
  };

  const handleSaveEdit = () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Please enter a group name.");
      return;
    }
    setEditSaving(true);
    updateGroup.mutate(
      {
        groupId,
        data: {
          name: trimmedName,
          description: editDescription.trim() ? editDescription.trim() : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
          queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          setEditSaving(false);
          setShowEditSheet(false);
        },
        onError: (err) => {
          setEditSaving(false);
          Alert.alert("Failed to update group", getErrorMessage(err));
        },
      },
    );
  };

  const handleSaveGroupAvatar = () => {
    if (!selectedAvatarUrl) return;
    setAvatarSaving(true);
    updateGroup.mutate(
      { groupId, data: { avatarUrl: selectedAvatarUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
          queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          setAvatarSaving(false);
          setShowAvatarSheet(false);
          setSelectedAvatarUrl(null);
        },
        onError: () => {
          setAvatarSaving(false);
          Alert.alert("Error", "Failed to save group photo.");
        },
      },
    );
  };

  if (group.isError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <Stack.Screen options={{ title: "Not found" }} />
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
          Page not found
        </Text>
        <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
          This group doesn&apos;t exist or you don&apos;t have access to it.
        </Text>
      </View>
    );
  }

  if (group.isLoading || !group.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "" }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const myUserId = me.data?.id;

  const totalGroupSpend = useMemo(
    () => (expenses.data ?? []).reduce((sum, e) => sum + e.totalAmount, 0),
    [expenses.data],
  );

  const combined = useMemo(
    () =>
      [
        ...(expenses.data ?? []).map((e) => ({
          kind: "expense" as const,
          id: `e-${e.id}`,
          data: e,
          date: e.date,
          createdAt: e.createdAt,
        })),
        ...(payments.data ?? []).map((p) => ({
          kind: "payment" as const,
          id: `p-${p.id}`,
          data: p,
          date: p.date,
          createdAt: p.createdAt,
        })),
      ].sort((a, b) => {
        const d = String(b.date).localeCompare(String(a.date));
        if (d !== 0) return d;
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      }),
    [expenses.data, payments.data],
  );

  const filteredCombined = useMemo(() => {
    let items = combined;
    if (filterPeriod !== "all") {
      const days = filterPeriod === "7d" ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      items = items.filter((item) => {
        const d = item.date instanceof Date ? item.date : new Date(item.date as string);
        return d >= cutoff;
      });
    }
    if (filterMemberId !== "all") {
      items = items.filter((item) => {
        if (item.kind === "expense") {
          return item.data.paidByUserId === filterMemberId;
        }
        return item.data.fromUserId === filterMemberId || item.data.toUserId === filterMemberId;
      });
    }
    return items;
  }, [combined, filterMemberId, filterPeriod]);

  const groupedActivity = useMemo(() => {
    const buckets = new Map<string, typeof filteredCombined>();
    const labels = new Map<string, string>();
    for (const it of filteredCombined) {
      const d = new Date(String(it.date));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = MONTH_FMT.format(d);
      if (!buckets.has(key)) buckets.set(key, [] as typeof filteredCombined);
      buckets.get(key)!.push(it);
      labels.set(key, label);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: labels.get(key) ?? key, items }));
  }, [filteredCombined]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerBackTitle: "Groups",
          // Always send the user to the Groups list — the label literally
          // says "Groups", and a generic router.back() can land on the wrong
          // place (e.g. Home tab) when this screen is reached via deep link,
          // cross-tab navigation, or after a router.replace from /groups/new.
          headerLeft: () => (
            <Pressable
              onPress={() => router.replace("/(tabs)/groups")}
              hitSlop={12}
              style={{ paddingHorizontal: 10, flexDirection: "row", alignItems: "center" }}
            >
              <Feather name="chevron-left" size={26} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 16, marginLeft: 2 }}>Groups</Text>
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable onPress={openEditSheet} style={{ paddingHorizontal: 10 }}>
                <Feather name="edit-2" size={18} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => setShowInviteModal(true)} style={{ paddingHorizontal: 10 }}>
                <MaterialCommunityIcons name="qrcode" size={22} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => setShowAddModal(true)} style={{ paddingHorizontal: 10 }}>
                <Feather name="user-plus" size={20} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />

      {/* Invite via QR Modal */}
      <InviteQRModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        groupName={group.data.name}
        inviteCode={group.data.inviteCode ?? null}
      />


      {/* Add Member Modal */}
      <Modal
        animationType="slide"
        transparent
        presentationStyle="pageSheet"
        visible={showAddModal}
        onRequestClose={() => { setShowAddModal(false); setMemberSearch(""); }}
      >
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add Member</Text>
            <Pressable onPress={() => { setShowAddModal(false); setMemberSearch(""); }} hitSlop={12}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={{ padding: 16 }}>
            <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search by name or email…"
                placeholderTextColor={colors.mutedForeground}
                value={memberSearch}
                onChangeText={setMemberSearch}
                autoFocus
              />
            </View>
          </View>

          {isSearching && searchResults.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          ) : searchResults.length === 0 ? (
            <Text style={[styles.emptySearch, { color: colors.mutedForeground }]}>
              {memberSearch ? "No match found. Try a full email address to find someone new." : "All your friends are already in this group."}
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {searchResults.map((user) => {
                const isPending = addingUserId === user.id;
                const initials = user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <View key={user.id} style={[styles.userRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.initials, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.initialsText, { color: colors.accentForeground }]}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.userName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{user.name}</Text>
                        {!user.isFriend && (
                          <View style={styles.newFriendBadge}>
                            <Text style={styles.newFriendBadgeText}>New friend</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{user.email}</Text>
                    </View>
                    <Pressable
                      disabled={isPending}
                      onPress={() => onAddMember(user)}
                      style={[styles.addBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.6 : 1 }]}
                    >
                      <Text style={styles.addBtnText}>{isPending ? "Adding…" : "Add"}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Card>
          {/* Group avatar + creator row */}
          <View style={styles.groupHeaderRow}>
            <Pressable onPress={() => setShowAvatarSheet(true)} style={styles.groupAvatarWrap}>
              {group.data.avatarUrl ? (
                <Image source={{ uri: group.data.avatarUrl }} style={styles.groupAvatar} />
              ) : (
                <View style={[styles.groupAvatarFallback, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.groupAvatarText, { color: colors.accentForeground }]}>
                    {group.data.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={[styles.groupCamBadge, { backgroundColor: colors.primary }]}>
                <Feather name="camera" size={10} color="#fff" />
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: colors.foreground, fontSize: 18, fontWeight: "600" }}
                numberOfLines={2}
              >
                {group.data.name}
              </Text>
              {group.data.description ? (
                <Text style={[styles.desc, { color: colors.mutedForeground, marginBottom: 0, marginTop: 2 }]} numberOfLines={2}>
                  {group.data.description}
                </Text>
              ) : null}
              {(() => {
                const creator = group.data.members.find((m) => m.userId === group.data?.createdByUserId);
                if (!creator) return null;
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    <MaterialCommunityIcons name="crown" size={13} color="#f59e0b" />
                    <Text style={[styles.creatorText, { color: colors.mutedForeground, marginTop: 0 }]}>
                      Created by{" "}
                      <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                        {creator.userId === myUserId ? "you" : creator.user.name}
                      </Text>
                      {group.data?.createdAt ? ` · ${formatDate(group.data.createdAt)}` : ""}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>

          <View style={styles.memberRow}>
            {group.data.members.map((m) => {
              const isMe = m.userId === myUserId;
              const inner = (
                <View key={m.id} style={{ alignItems: "center", width: 56 }}>
                  <View style={{ position: "relative" }}>
                    <Avatar name={m.user.name} url={m.user.avatarUrl} size={40} />
                    {m.userId === group.data?.createdByUserId && (
                      <View style={{
                        position: "absolute", top: -5, right: -5,
                        backgroundColor: "#f59e0b", borderRadius: 8,
                        padding: 2, borderWidth: 1.5, borderColor: colors.background,
                      }}>
                        <MaterialCommunityIcons name="crown" size={9} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberName, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {isMe ? "You" : m.user.name.split(" ")[0]}
                  </Text>
                </View>
              );
              if (isMe) return inner;
              return (
                <Pressable key={m.id} onPress={() => setProfileMember(m)}>
                  {inner}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionRow}>
            <View style={{ flex: 1 }}>
              <Button
                title="Add expense"
                icon={<Feather name="plus" size={16} color="#fff" />}
                onPress={() => router.push({ pathname: "/expenses/new", params: { groupId: String(groupId) } })}
                fullWidth
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Settle up"
                variant="outline"
                icon={<Feather name="check" size={16} color={colors.foreground} />}
                onPress={() => router.push({ pathname: "/payments/new", params: { groupId: String(groupId) } })}
                fullWidth
              />
            </View>
          </View>

          <View style={[styles.spendRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.spendLabel, { color: colors.mutedForeground }]}>Total group spend</Text>
            <Text style={[styles.spendValue, { color: colors.foreground }]}>{formatCurrency(totalGroupSpend, groupCurrency)}</Text>
          </View>
        </Card>

        <View style={[styles.tabs, { borderColor: colors.border }]}>
          {(["expenses", "balances"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, { borderBottomColor: tab === t ? colors.primary : "transparent" }]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: tab === t ? colors.primary : colors.mutedForeground,
                    fontFamily: tab === t ? "Inter_600SemiBold" : "Inter_500Medium",
                  },
                ]}
              >
                {t === "expenses" ? "Activity" : "Balances"}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "expenses" ? (
          <View style={{ gap: 8 }}>
            {/* Member filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
                {(["all", ...group.data.members.map((m) => m.userId)] as (number | "all")[]).map((uid) => {
                  const m = uid === "all" ? null : group.data.members.find((mm) => mm.userId === uid);
                  const label = uid === "all" ? "All" : (m ? (m.userId === myUserId ? "You" : m.user.name.split(" ")[0]) : "");
                  const active = filterMemberId === uid;
                  return (
                    <Pressable
                      key={String(uid)}
                      onPress={() => setFilterMemberId(uid)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      {uid !== "all" && m && (
                        <Avatar name={m.user.name} url={m.user.avatarUrl} size={16} />
                      )}
                      <Text style={[styles.filterChipText, { color: active ? "#fff" : colors.foreground }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Period filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
                {([["all", "All time"], ["7d", "Last 7 days"], ["30d", "Last 30 days"]] as [typeof filterPeriod, string][]).map(([val, label]) => {
                  const active = filterPeriod === val;
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setFilterPeriod(val)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.filterChipText, { color: active ? "#fff" : colors.foreground }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

          {filteredCombined.length > 0 ? (
            <View style={{ gap: 16 }}>
              {groupedActivity.map((bucket) => (
                <View key={bucket.key} style={{ gap: 8 }}>
                  <Text style={[styles.monthLabel, { color: colors.mutedForeground }]}>
                    {bucket.label.toUpperCase()}
                  </Text>
              {bucket.items.map((item) => {
                if (item.kind === "expense") {
                  const e = item.data;
                  const youPaid = e.paidByUserId === myUserId;
                  const yourSplit = e.splits.find((s) => s.userId === myUserId);
                  const yourShare = yourSplit?.amount ?? 0;
                  const lentOrBorrowed = youPaid ? e.totalAmount - yourShare : -yourShare;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => router.push(`/expenses/${e.id}`)}
                      android_ripple={{ color: colors.accent }}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    >
                    <Card style={styles.activityRow}>
                      <View style={{ position: "relative" }}>
                        <View style={[styles.bubble, { backgroundColor: colors.muted, borderRadius: 100 }]}>
                          <MaterialCommunityIcons name={getCategoryIcon(e.category)} size={18} color={colors.mutedForeground} />
                        </View>
                        {e.paidByUser && (
                          <View style={{ position: "absolute", right: -4, bottom: -4, borderWidth: 2, borderColor: colors.background, borderRadius: 999 }}>
                            <Avatar name={e.paidByUser.name} url={e.paidByUser.avatarUrl} size={18} />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.activityTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {e.description}
                        </Text>
                        <Text style={[styles.activitySub, { color: colors.mutedForeground }]}>
                          {youPaid ? "You" : e.paidByUser.name} paid {formatCurrency(e.totalAmount, groupCurrency)} · {e.category ?? "General"} · {formatDate(e.date)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.activityAmount,
                          { color: lentOrBorrowed > 0 ? colors.positive : lentOrBorrowed < 0 ? colors.negative : colors.mutedForeground },
                        ]}
                      >
                        {lentOrBorrowed > 0
                          ? `+${formatCurrency(lentOrBorrowed, groupCurrency)}`
                          : lentOrBorrowed < 0
                            ? `-${formatCurrency(Math.abs(lentOrBorrowed), groupCurrency)}`
                            : formatCurrency(0, groupCurrency)}
                      </Text>
                    </Card>
                    </Pressable>
                  );
                }
                const p = item.data;
                const fromYou = p.fromUserId === myUserId;
                const toYou = p.toUserId === myUserId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setSelectedPayment(p)}
                    android_ripple={{ color: colors.accent }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                  <Card style={styles.activityRow}>
                    <View style={{ position: "relative" }}>
                      <View style={[styles.bubble, { backgroundColor: "#dcfce7", borderRadius: 100 }]}>
                        <Feather name="check-circle" size={18} color="#16a34a" />
                      </View>
                      {p.fromUser && (
                        <View style={{ position: "absolute", right: -4, bottom: -4, borderWidth: 2, borderColor: colors.background, borderRadius: 999 }}>
                          <Avatar name={p.fromUser.name} url={p.fromUser.avatarUrl} size={18} />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.activityTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {fromYou ? "You" : p.fromUser.name} settled with {toYou ? "you" : p.toUser.name}
                        </Text>
                      </View>
                      <Text style={[styles.activitySub, { color: colors.mutedForeground }]}>
                        {formatDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                      </Text>
                    </View>
                    <Text style={[styles.activityAmount, { color: "#16a34a" }]}>
                      {formatCurrency(p.amount, groupCurrency)}
                    </Text>
                  </Card>
                  </Pressable>
                );
              })}
                </View>
              ))}
            </View>
          ) : (
            <Card>
              <EmptyState icon="file-text" title="No activity yet" message="Add an expense to start splitting." />
            </Card>
          )}
          </View>
        ) : balances.data && balances.data.length > 0 ? (
          <View style={{ gap: 8 }}>
            {balances.data.map((b, i) => (
              <Card key={`${b.fromUserId}-${b.toUserId}-${i}`} style={styles.balanceRow}>
                <Avatar name={b.fromUser.name} url={b.fromUser.avatarUrl} size={32} />
                <Text style={[styles.balanceText, { color: colors.foreground }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {b.fromUserId === myUserId ? "You" : b.fromUser.name}
                  </Text>{" "}
                  owe{b.fromUserId === myUserId ? "" : "s"}{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {b.toUserId === myUserId ? "you" : b.toUser.name}
                  </Text>
                </Text>
                <Text style={[styles.balanceAmount, { color: colors.negative }]}>
                  {formatCurrency(b.amount, groupCurrency)}
                </Text>
              </Card>
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState icon="check-circle" title="All settled up" message="Everyone in this group is even." />
          </Card>
        )}
      </ScrollView>

      {/* Member profile sheet */}
      <Modal
        visible={!!profileMember}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileMember(null)}
      >
        <View style={styles.overlaySheet}>
          <View style={[styles.avatarSheet, { backgroundColor: colors.background }]}>
            {profileMember && (() => {
              const pm = profileMember;
              const isCreator = group.data?.createdByUserId === pm.userId;
              const owesMe = balances.data?.find(b => b.fromUserId === pm.userId && b.toUserId === myUserId);
              const iOwe = balances.data?.find(b => b.fromUserId === myUserId && b.toUserId === pm.userId);
              const netAmount = owesMe ? owesMe.amount : iOwe ? -iOwe.amount : 0;
              return (
                <>
                  <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Profile</Text>
                    <Pressable onPress={() => setProfileMember(null)} hitSlop={12}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <View style={{ padding: 24, alignItems: "center", gap: 10 }}>
                    <View style={{ position: "relative" }}>
                      <Avatar name={pm.user.name} url={pm.user.avatarUrl} size={72} />
                      {isCreator && (
                        <View style={{
                          position: "absolute", top: -6, right: -6,
                          backgroundColor: "#f59e0b", borderRadius: 10,
                          padding: 3, borderWidth: 2, borderColor: colors.background,
                        }}>
                          <MaterialCommunityIcons name="crown" size={12} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.foreground }}>
                      {pm.user.name}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
                      {pm.user.email}
                    </Text>
                    {isCreator && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <MaterialCommunityIcons name="crown" size={13} color="#f59e0b" />
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#f59e0b" }}>Group admin</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ marginHorizontal: 20, borderRadius: 12, padding: 16, backgroundColor: colors.muted, alignItems: "center", gap: 4 }}>
                    {netAmount === 0 ? (
                      <>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.foreground }}>All settled up</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>No balance with {pm.user.name.split(" ")[0]}</Text>
                      </>
                    ) : netAmount > 0 ? (
                      <>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#16a34a" }}>{formatCurrency(netAmount, groupCurrency)}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>{pm.user.name.split(" ")[0]} owes you</Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#dc2626" }}>{formatCurrency(Math.abs(netAmount), groupCurrency)}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>You owe {pm.user.name.split(" ")[0]}</Text>
                      </>
                    )}
                  </View>
                  <View style={{ padding: 20, gap: 10 }}>
                    <Button
                      title="Settle up"
                      icon={<Feather name="check-circle" size={16} color="#fff" />}
                      onPress={() => {
                        setProfileMember(null);
                        router.push({ pathname: "/payments/new", params: { groupId: String(groupId), toUserId: String(pm.userId) } });
                      }}
                    />
                    <Button
                      title="View activity"
                      variant="outline"
                      onPress={() => {
                        setProfileMember(null);
                        setTab("expenses");
                        setFilterMemberId(pm.userId);
                      }}
                    />
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Edit group sheet */}
      <Modal
        visible={showEditSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditSheet(false)}
      >
        <View style={styles.overlaySheet}>
          <View style={[styles.avatarSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Edit group</Text>
              <Pressable onPress={() => setShowEditSheet(false)} hitSlop={12}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 6 }}>
                <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13 }, { color: colors.foreground }]}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  maxLength={80}
                  placeholder="Group name"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.editInput,
                    { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border },
                  ]}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13 }, { color: colors.foreground }]}>Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  maxLength={500}
                  multiline
                  numberOfLines={4}
                  placeholder="Optional"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.editInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      minHeight: 90,
                      textAlignVertical: "top",
                      paddingTop: 10,
                    },
                  ]}
                />
              </View>
            </ScrollView>
            <View style={[styles.sheetFooterRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <Button title="Cancel" variant="outline" onPress={() => setShowEditSheet(false)} />
              <Button title={editSaving ? "Saving…" : "Save"} onPress={handleSaveEdit} disabled={editSaving || !editName.trim()} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Group avatar sheet */}
      <Modal
        visible={showAvatarSheet}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowAvatarSheet(false); setSelectedAvatarUrl(null); }}
      >
        <View style={styles.overlaySheet}>
          <View style={[styles.avatarSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Group photo</Text>
              <Pressable onPress={() => { setShowAvatarSheet(false); setSelectedAvatarUrl(null); }} hitSlop={12}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
              {/* Preview */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                {(selectedAvatarUrl ?? group.data.avatarUrl) ? (
                  <Image source={{ uri: selectedAvatarUrl ?? group.data.avatarUrl! }} style={styles.groupAvatar} />
                ) : (
                  <View style={[styles.groupAvatarFallback, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.groupAvatarText, { color: colors.accentForeground }]}>
                      {group.data.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13 }, { color: colors.mutedForeground }]}>
                  {selectedAvatarUrl ? "Tap Save to apply." : "Pick a preset icon or upload a photo."}
                </Text>
              </View>

              <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 8 }, { color: colors.foreground }]}>Preset icons</Text>
              <FlatList
                data={GROUP_PRESETS}
                keyExtractor={(item) => item.url}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                renderItem={({ item }) => {
                  const isSelected = selectedAvatarUrl === item.url || (!selectedAvatarUrl && group.data?.avatarUrl === item.url);
                  return (
                    <Pressable onPress={() => setSelectedAvatarUrl(item.url)}>
                      <Image
                        source={{ uri: item.url }}
                        style={[styles.presetImg, { borderColor: isSelected ? colors.primary : colors.border }]}
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

              <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 14 }, { color: colors.foreground }]}>Upload photo</Text>
              <Pressable
                onPress={handlePickGroupAvatar}
                style={[styles.uploadBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <Feather name="image" size={22} color={colors.mutedForeground} />
                <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13 }, { color: colors.foreground }]}>Choose from gallery</Text>
              </Pressable>
            </ScrollView>

            <View style={[styles.sheetFooterRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <Button title="Cancel" variant="outline" onPress={() => { setShowAvatarSheet(false); setSelectedAvatarUrl(null); }} />
              <Button title={avatarSaving ? "Saving…" : "Save"} onPress={handleSaveGroupAvatar} disabled={!selectedAvatarUrl || avatarSaving} />
            </View>
          </View>
        </View>
      </Modal>

      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          currentUserId={myUserId}
          onClose={() => setSelectedPayment(null)}
        />
      )}
    </>
  );
}

function InviteQRModal({
  visible,
  onClose,
  groupName,
  inviteCode,
}: {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  inviteCode: string | null;
}) {
  const colors = useColors();
  const inviteUrl = inviteCode
    ? `${API_BASE_URL || ""}/groups/join/${inviteCode}`
    : "";

  const onShare = async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: `Join "${groupName}" on Splitix: ${inviteUrl}`,
        url: inviteUrl,
      });
    } catch {
      // user cancelled — ignore
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Invite to {groupName}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={{ padding: 24, alignItems: "center" }}>
          {inviteCode ? (
            <>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center", marginBottom: 16 }}>
                Anyone who scans this code (or opens the link) can join the group.
              </Text>
              <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12 }}>
                <QRCode value={inviteUrl} size={220} />
              </View>
              <View style={{ marginTop: 20, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, letterSpacing: 0.5 }}>CODE</Text>
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 18,
                    fontFamily: "Inter_600SemiBold",
                    letterSpacing: 2,
                    marginTop: 4,
                  }}
                  selectable
                >
                  {inviteCode}
                </Text>
              </View>
              <Pressable
                onPress={onShare}
                style={{
                  marginTop: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: colors.primary,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 10,
                }}
              >
                <Feather name="share" size={16} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                  Share invite link
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
              No invite code available yet.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },
  desc: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12 },
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  memberName: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2 },
  tabText: { fontSize: 14 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bubble: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  activityTitle: { fontFamily: "Inter_500Medium", fontSize: 14 },
  activitySub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  monthLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.8, marginTop: 4 },
  editInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  activityAmount: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  balanceText: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
  balanceAmount: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sheet: { flex: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, marginTop: 60 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  searchRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  initials: { width: 40, height: 40, borderRadius: 100, alignItems: "center", justifyContent: "center" },
  initialsText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  userName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  userEmail: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  emptySearch: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 32, paddingHorizontal: 16 },
  newFriendBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100, backgroundColor: "#dbeafe" },
  newFriendBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#1d4ed8" },
  groupHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  groupAvatarWrap: { position: "relative" },
  groupAvatar: { width: 64, height: 64, borderRadius: 12 },
  groupAvatarFallback: { width: 64, height: 64, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  groupAvatarText: { fontFamily: "Inter_700Bold", fontSize: 22 },
  groupCamBadge: { position: "absolute", bottom: -4, right: -4, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  creatorText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  spendRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 14, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  spendLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  spendValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  overlaySheet: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  avatarSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: 8 },
  presetImg: { width: 64, height: 64, borderRadius: 10, borderWidth: 2 },
  checkBadge: { position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, borderWidth: 1 },
  sheetFooterRow: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
