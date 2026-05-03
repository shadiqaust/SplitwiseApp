import { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getListExpensesQueryKey,
  getGetExpenseQueryKey,
  getListExpenseCommentsQueryKey,
  useGetExpense,
  useGetMe,
  useListExpenseComments,
  useCreateExpenseComment,
  useDeleteExpenseComment,
  useDeleteExpense,
  useListGroups,
  type ExpenseComment,
} from "@workspace/api-client-react";
import { ArrowLeft, MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { getCategoryIcon } from "@/lib/expense-categories";

import { Layout } from "@/components/layout";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import { cn, formatCurrency, formatDate } from "@/lib/format";
import { photoSrc } from "@/lib/upload";
import { resolveAvatarUrl } from "@/lib/avatar-presets";

export function ExpenseDetailPage() {
  const params = useParams<{ expenseId: string }>();
  const expenseId = params.expenseId;
  const [, navigate] = useLocation();
  // Honor an explicit `?from=` referrer so back returns to the screen that
  // sent us here (e.g. friend detail) instead of the default group page.
  const fromHref = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("from");
    if (!raw) return null;
    // Only allow same-origin in-app paths.
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
  }, []);
  const me = useGetMe();
  const myId = me.data?.id;
  const expenseQ = useGetExpense(expenseId);
  const { data: groupsList } = useListGroups();
  const commentsQ = useListExpenseComments(expenseId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createComment = useCreateExpenseComment();
  const deleteComment = useDeleteExpenseComment();
  const deleteExpenseMutation = useDeleteExpense();
  const [draft, setDraft] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);

  const expense = expenseQ.data;
  const comments = commentsQ.data ?? [];
  const groupName = useMemo(() => {
    if (!expense?.groupId) return null;
    return groupsList?.find((g) => g.id === expense.groupId)?.name ?? null;
  }, [expense?.groupId, groupsList]);

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
    createComment.mutate(
      { expenseId, data: { body } },
      {
        onSuccess: () => {
          setDraft("");
          queryClient.invalidateQueries({
            queryKey: getListExpenseCommentsQueryKey(expenseId),
          });
        },
        onError: (err) =>
          toast({
            title: "Couldn't post comment",
            description: getErrorMessage(err),
            variant: "destructive",
          }),
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
        onError: (err) =>
          toast({
            title: "Couldn't delete comment",
            description: getErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  };

  const deleteExpenseFn = () => {
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
          if (expense.groupId) {
            queryClient.invalidateQueries({
              queryKey: getListExpensesQueryKey(expense.groupId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetGroupBalancesQueryKey(expense.groupId),
            });
          }
          toast({ title: "Expense deleted" });
          if (expense.groupId) {
            navigate(`/groups/${expense.groupId}`);
          } else {
            navigate("/non-group-expenses");
          }
        },
        onError: (err) => {
          toast({
            title: "Couldn't delete expense",
            description: getErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  if (expenseQ.isLoading && !expense) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <Skeleton className="h-7 w-1/3" />
          <Card>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-12 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!expense) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto p-6 text-center space-y-4">
          <p className="text-muted-foreground">Expense not found.</p>
          <Link href="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const total = Number(expense.totalAmount);
  const paidByName =
    expense.paidByUserId === myId
      ? "You"
      : expense.paidByUser?.name ?? "Someone";
  const backHref =
    fromHref ??
    (expense.groupId ? `/groups/${expense.groupId}` : "/non-group-expenses");

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={backHref}>
            <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </a>
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/expenses/${expenseId}/edit`)}
              aria-label="Edit expense"
              title="Edit expense"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deleteExpenseMutation.isPending}
                  aria-label="Delete expense"
                  title="Delete expense"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the expense and update everyone's balance.
                    You can't undo this from the app.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deleteExpenseFn}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              {(() => {
                const Icon = getCategoryIcon(expense.category);
                return (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-muted-foreground" />
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-xl font-semibold break-words">
                  {expense.description}
                </p>
                <p className="text-sm text-muted-foreground">
                  {paidByName} paid · {expense.category ?? "General"} ·{" "}
                  {formatDate(expense.date)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {expense.groupId
                    ? groupName ?? "Group expense"
                    : "Non-group expense"}
                </p>
              </div>
              {expense.photoUrl && photoSrc(expense.photoUrl) && (
                <button
                  type="button"
                  onClick={() => setPhotoOpen(true)}
                  className="shrink-0 rounded-lg overflow-hidden border bg-muted hover:opacity-90 transition-opacity"
                  aria-label="Open receipt"
                >
                  <img
                    src={photoSrc(expense.photoUrl)!}
                    alt="Receipt"
                    className="h-20 w-20 object-cover"
                  />
                </button>
              )}
            </div>

            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">{formatCurrency(total, expense.currency)}</p>
                <p className="text-xs text-muted-foreground">total amount</p>
              </div>
              {myShare !== null && (
                <div className="text-right">
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      lentOrBorrowed > 0
                        ? "text-green-600"
                        : lentOrBorrowed < 0
                          ? "text-red-500"
                          : "text-muted-foreground",
                    )}
                  >
                    {lentOrBorrowed > 0
                      ? `+${formatCurrency(lentOrBorrowed, expense.currency)}`
                      : lentOrBorrowed < 0
                        ? `-${formatCurrency(Math.abs(lentOrBorrowed), expense.currency)}`
                        : formatCurrency(0, expense.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lentOrBorrowed > 0
                      ? "you lent"
                      : lentOrBorrowed < 0
                        ? "you owe"
                        : "settled"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Split breakdown</p>
            <div className="divide-y">
              {expense.splits.map((s) => {
                const isMe = s.userId === myId;
                const isPayer = s.userId === expense.paidByUserId;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2 gap-3"
                  >
                    <UserAvatar
                      name={s.user?.name ?? "Member"}
                      url={s.user?.avatarUrl ?? null}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {isMe ? "You" : s.user?.name ?? "Member"}
                        {isPayer && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (paid)
                          </span>
                        )}
                      </p>
                      {s.percentage != null && (
                        <p className="text-xs text-muted-foreground">
                          {Number(s.percentage).toFixed(1)}%
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-medium">
                      {formatCurrency(Number(s.amount), expense.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold">
                Comments
                {comments.length > 0 ? ` (${comments.length})` : ""}
              </p>
            </div>

            <div className="space-y-3">
              {commentsQ.isLoading && comments.length === 0 ? (
                <Skeleton className="h-12 w-full" />
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Be the first to comment.
                </p>
              ) : (
                comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    canDelete={c.userId === myId}
                    onDelete={() => removeComment(c.id)}
                    deleting={deleteComment.isPending}
                  />
                ))
              )}
            </div>

            <div className="flex gap-2 items-end">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitComment();
                  }
                }}
              />
              <Button
                onClick={submitComment}
                disabled={!draft.trim() || createComment.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {expense.photoUrl && photoSrc(expense.photoUrl) && (
          <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
            <DialogContent className="max-w-3xl p-2 bg-black/95 border-0">
              <DialogTitle className="sr-only">Receipt</DialogTitle>
              <DialogDescription className="sr-only">
                Receipt photo preview
              </DialogDescription>
              <img
                src={photoSrc(expense.photoUrl)!}
                alt="Receipt"
                className="w-full max-h-[80vh] object-contain"
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
}

function CommentItem({
  comment,
  canDelete,
  onDelete,
  deleting,
}: {
  comment: ExpenseComment;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      {comment.user?.avatarUrl ? (
        <img
          src={resolveAvatarUrl(comment.user.avatarUrl) ?? comment.user.avatarUrl}
          alt={comment.user.name ?? "User"}
          className="w-8 h-8 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
          {(comment.user?.name ?? "?").slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-semibold">
            {comment.user?.name ?? "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(comment.createdAt)}
          </p>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">
          {comment.body}
        </p>
      </div>
      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={deleting}
              className="text-muted-foreground hover:text-destructive p-1"
              aria-label="Delete comment"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
              <AlertDialogDescription>
                This comment will be removed for everyone on this expense.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
