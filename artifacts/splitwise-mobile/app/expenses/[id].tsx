import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getListExpensesQueryKey,
  getListExpenseCommentsQueryKey,
  useGetExpense,
  useGetMe,
  useListExpenseComments,
  useCreateExpenseComment,
  useDeleteExpenseComment,
  useDeleteExpense,
  type ExpenseComment,
} from "@workspace/api-client-react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { useColors } from "@/hooks/useColors";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency, formatDate } from "@/lib/format";
import { photoUri } from "@/lib/upload";

export default function ExpenseDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const expenseId = String(params.id ?? "");
  const router = useRouter();
  const colors = useColors();
  const me = useGetMe();
  const myId = me.data?.id;
  const expenseQ = useGetExpense(expenseId);
  const commentsQ = useListExpenseComments(expenseId);
  const queryClient = useQueryClient();
  const createComment = useCreateExpenseComment();
  const deleteComment = useDeleteExpenseComment();
  const deleteExpenseMutation = useDeleteExpense();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const expense = expenseQ.data;
  const comments = commentsQ.data ?? [];

  const myShare = useMemo(() => {
    if (!expense || !myId) return null;
    const s = expense.splits.find((x) => x.userId === myId);
    return s ? Number(s.amount) : null;
  }, [expense, myId]);

  const lentOrBorrowed = useMemo(() => {
    if (!expense || !myId) return 0;
    const total = Number(expense.totalAmount);
    const mine = myShare ?? 0;
    return expense.paidByUserId === myId ? total - mine : -mine;
  }, [expense, myId, myShare]);

  const submitComment = () => {
    const body = draft.trim();
    if (!body || !expenseId) return;
    setError(null);
    createComment.mutate(
      { expenseId, data: { body } },
      {
        onSuccess: () => {
          setDraft("");
          queryClient.invalidateQueries({
            queryKey: getListExpenseCommentsQueryKey(expenseId),
          });
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  };

  const removeComment = (commentId: string) => {
    if (!expenseId) return;
    deleteComment.mutate(
      { expenseId, commentId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListExpenseCommentsQueryKey(expenseId),
          });
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  };

  const onDeleteExpense = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!expenseId || !expense) return;
    deleteExpenseMutation.mutate(
      { expenseId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: ["non-group-expenses"] });
          queryClient.invalidateQueries({ queryKey: ["friend-activity"] });
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          queryClient.invalidateQueries({ queryKey: ["friends-mobile"] });
          if (expense.groupId) {
            queryClient.invalidateQueries({
              queryKey: getListExpensesQueryKey(expense.groupId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetGroupBalancesQueryKey(expense.groupId),
            });
          }
          if (router.canGoBack()) router.back();
          else router.replace("/");
        },
        onError: (err) => {
          setError(getErrorMessage(err));
          setConfirmDelete(false);
        },
      },
    );
  };

  if (expenseQ.isLoading && !expense) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>
          Expense not found.
        </Text>
      </View>
    );
  }

  const total = Number(expense.totalAmount);
  const paidByName =
    expense.paidByUserId === myId
      ? "You"
      : expense.paidByUser?.name ?? "Someone";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Expense",
          headerBackTitle: "Back",
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            {expense.photoUrl && photoUri(expense.photoUrl) && (
              <Pressable
                onPress={() => setPhotoOpen(true)}
                style={({ pressed }) => [
                  styles.receiptThumbWrap,
                  { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Image
                  source={{ uri: photoUri(expense.photoUrl)! }}
                  style={styles.receiptThumb}
                  resizeMode="cover"
                />
              </Pressable>
            )}

            <View style={styles.headerRow}>
              <View style={[styles.bubble, { backgroundColor: colors.muted }]}>
                <Feather
                  name="file-text"
                  size={22}
                  color={colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.title, { color: colors.foreground }]}
                  numberOfLines={2}
                >
                  {expense.description}
                </Text>
                <Text
                  style={[styles.subTitle, { color: colors.mutedForeground }]}
                >
                  {paidByName} paid · {expense.category ?? "General"} ·{" "}
                  {formatDate(expense.date)}
                </Text>
                <Text
                  style={[styles.subTitleSmall, { color: colors.mutedForeground }]}
                >
                  {expense.groupId ? "Group expense" : "Non-group expense"}
                </Text>
              </View>
              <View style={styles.iconBtnGroup}>
                <Pressable
                  onPress={() => router.push(`/expenses/edit/${expenseId}`)}
                  hitSlop={8}
                  accessibilityLabel="Edit expense"
                  style={({ pressed }) => [
                    styles.iconBtn,
                    {
                      backgroundColor: colors.muted,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather
                    name="edit-2"
                    size={16}
                    color={colors.foreground}
                  />
                </Pressable>
                <Pressable
                  onPress={onDeleteExpense}
                  disabled={deleteExpenseMutation.isPending}
                  hitSlop={8}
                  accessibilityLabel={
                    confirmDelete ? "Confirm delete expense" : "Delete expense"
                  }
                  style={({ pressed }) => [
                    styles.iconBtn,
                    {
                      backgroundColor: confirmDelete
                        ? colors.negative
                        : colors.muted,
                      opacity: deleteExpenseMutation.isPending
                        ? 0.5
                        : pressed
                          ? 0.7
                          : 1,
                    },
                  ]}
                >
                  <Feather
                    name="trash-2"
                    size={16}
                    color={confirmDelete ? "#fff" : colors.negative}
                  />
                </Pressable>
              </View>
            </View>

            {confirmDelete && (
              <Text
                style={{
                  color: colors.negative,
                  fontSize: 11,
                  marginTop: 8,
                  textAlign: "right",
                }}
              >
                Tap the trash icon again to confirm.
              </Text>
            )}

            <View style={styles.amountRow}>
              <View>
                <Text style={[styles.bigAmount, { color: colors.foreground }]}>
                  {formatCurrency(total)}
                </Text>
                <Text style={[styles.tinyMuted, { color: colors.mutedForeground }]}>
                  total amount
                </Text>
              </View>
              {myShare !== null && (
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.impactText,
                      {
                        color:
                          lentOrBorrowed > 0
                            ? colors.positive
                            : lentOrBorrowed < 0
                              ? colors.negative
                              : colors.mutedForeground,
                      },
                    ]}
                  >
                    {lentOrBorrowed > 0
                      ? `+${formatCurrency(lentOrBorrowed)}`
                      : lentOrBorrowed < 0
                        ? `-${formatCurrency(Math.abs(lentOrBorrowed))}`
                        : formatCurrency(0)}
                  </Text>
                  <Text
                    style={[styles.tinyMuted, { color: colors.mutedForeground }]}
                  >
                    {lentOrBorrowed > 0
                      ? "you lent"
                      : lentOrBorrowed < 0
                        ? "you owe"
                        : "settled"}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Split breakdown
            </Text>
            {expense.splits.map((s, idx) => {
              const isMe = s.userId === myId;
              const isPayer = s.userId === expense.paidByUserId;
              return (
                <View
                  key={s.id}
                  style={[
                    styles.splitRow,
                    idx > 0 && {
                      borderTopColor: colors.border,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.splitName, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {isMe ? "You" : s.user?.name ?? "Member"}
                      {isPayer && (
                        <Text
                          style={{ color: colors.mutedForeground, fontSize: 12 }}
                        >
                          {"  (paid)"}
                        </Text>
                      )}
                    </Text>
                    {s.percentage != null && (
                      <Text
                        style={[
                          styles.splitMeta,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {Number(s.percentage).toFixed(1)}%
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.splitAmount, { color: colors.foreground }]}>
                    {formatCurrency(Number(s.amount))}
                  </Text>
                </View>
              );
            })}
          </Card>

          <Card>
            <View style={styles.commentsHeader}>
              <Feather
                name="message-circle"
                size={16}
                color={colors.mutedForeground}
              />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Comments{comments.length > 0 ? ` (${comments.length})` : ""}
              </Text>
            </View>

            {commentsQ.isLoading && comments.length === 0 ? (
              <ActivityIndicator color={colors.primary} />
            ) : comments.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                Be the first to comment.
              </Text>
            ) : (
              <View style={{ gap: 14 }}>
                {comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    canDelete={c.userId === myId}
                    onDelete={() => removeComment(c.id)}
                    deleting={deleteComment.isPending}
                    colors={colors}
                  />
                ))}
              </View>
            )}

            {error && (
              <Text style={{ color: colors.negative, fontSize: 12, marginTop: 8 }}>
                {error}
              </Text>
            )}

            <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Pressable
                onPress={submitComment}
                disabled={!draft.trim() || createComment.isPending}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      !draft.trim() || createComment.isPending
                        ? 0.5
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
              >
                <Feather name="send" size={16} color={colors.primaryForeground} />
              </Pressable>
            </View>
          </Card>

        </ScrollView>
      </KeyboardAvoidingView>

      {expense.photoUrl && photoUri(expense.photoUrl) && (
        <Modal
          visible={photoOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPhotoOpen(false)}
          >
            <Pressable
              onPress={() => setPhotoOpen(false)}
              style={styles.modalCloseBtn}
              hitSlop={12}
              accessibilityLabel="Close receipt"
            >
              <Feather name="x" size={22} color="#fff" />
            </Pressable>
            <Image
              source={{ uri: photoUri(expense.photoUrl)! }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </Pressable>
        </Modal>
      )}
    </>
  );
}

function CommentItem({
  comment,
  canDelete,
  onDelete,
  deleting,
  colors,
}: {
  comment: ExpenseComment;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.commentRow}>
      <Avatar
        name={comment.user?.name ?? "?"}
        url={comment.user?.avatarUrl ?? null}
        size={28}
      />
      <View style={{ flex: 1 }}>
        <View style={styles.commentNameRow}>
          <Text
            style={[styles.commentName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {comment.user?.name ?? "Unknown"}
          </Text>
          <Text style={[styles.commentDate, { color: colors.mutedForeground }]}>
            {formatDate(comment.createdAt)}
          </Text>
        </View>
        <Text style={[styles.commentBody, { color: colors.foreground }]}>
          {comment.body}
        </Text>
      </View>
      {canDelete && (
        <Pressable
          onPress={onDelete}
          disabled={deleting}
          hitSlop={8}
          style={{ padding: 4 }}
          accessibilityLabel="Delete comment"
        >
          <Feather name="trash-2" size={14} color={colors.mutedForeground} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  bubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 18 },
  subTitle: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  subTitleSmall: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 14,
  },
  bigAmount: { fontFamily: "Inter_700Bold", fontSize: 28 },
  tinyMuted: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  impactText: { fontFamily: "Inter_700Bold", fontSize: 18 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginBottom: 8,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  splitName: { fontFamily: "Inter_500Medium", fontSize: 14 },
  splitMeta: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  splitAmount: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  sendBtn: {
    width: 40,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  commentNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  },
  commentName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  commentDate: { fontFamily: "Inter_400Regular", fontSize: 11 },
  commentBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
  },
  iconBtnGroup: { flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptThumbWrap: {
    alignSelf: "flex-start",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  receiptThumb: {
    width: 80,
    height: 80,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalImage: {
    width: "100%",
    height: "85%",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    zIndex: 10,
  },
});
