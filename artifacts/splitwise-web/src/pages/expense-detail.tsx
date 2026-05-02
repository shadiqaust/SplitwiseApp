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
  type ExpenseComment,
} from "@workspace/api-client-react";
import { ArrowLeft, MessageSquare, Pencil, Receipt, Send, Trash2 } from "lucide-react";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import { cn, formatCurrency, formatDate } from "@/lib/format";
import { photoSrc } from "@/lib/upload";

export function ExpenseDetailPage() {
  const params = useParams<{ expenseId: string }>();
  const expenseId = params.expenseId;
  const [, navigate] = useLocation();
  const me = useGetMe();
  const myId = me.data?.id;
  const expenseQ = useGetExpense(expenseId);
  const commentsQ = useListExpenseComments(expenseId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createComment = useCreateExpenseComment();
  const deleteComment = useDeleteExpenseComment();
  const deleteExpenseMutation = useDeleteExpense();
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          setConfirmDelete(false);
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
  const backHref = expense.groupId
    ? `/groups/${expense.groupId}`
    : "/non-group-expenses";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <Link href={backHref}>
          <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </a>
        </Link>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Receipt className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xl font-semibold break-words">
                  {expense.description}
                </p>
                <p className="text-sm text-muted-foreground">
                  {paidByName} paid · {expense.category ?? "General"} ·{" "}
                  {formatDate(expense.date)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {expense.groupId ? "Group expense" : "Non-group expense"}
                </p>
              </div>
            </div>

            {expense.photoUrl && photoSrc(expense.photoUrl) && (
              <a
                href={photoSrc(expense.photoUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border bg-muted"
              >
                <img
                  src={photoSrc(expense.photoUrl)!}
                  alt="Receipt"
                  className="w-full max-h-80 object-contain"
                />
              </a>
            )}

            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">{formatCurrency(total)}</p>
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
                      ? `+${formatCurrency(lentOrBorrowed)}`
                      : lentOrBorrowed < 0
                        ? `-${formatCurrency(Math.abs(lentOrBorrowed))}`
                        : formatCurrency(0)}
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
                    className="flex items-center justify-between py-2"
                  >
                    <div className="min-w-0">
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
                      {formatCurrency(Number(s.amount))}
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

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(`/expenses/${expenseId}/edit`)}
          >
            <Pencil className="w-4 h-4 mr-1" /> Edit expense
          </Button>
          <Button
            variant="destructive"
            onClick={deleteExpenseFn}
            disabled={deleteExpenseMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {confirmDelete ? "Confirm delete expense" : "Delete expense"}
          </Button>
        </div>
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
          src={comment.user.avatarUrl}
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
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="text-muted-foreground hover:text-destructive p-1"
          aria-label="Delete comment"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
