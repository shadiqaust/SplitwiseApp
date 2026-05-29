import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetGroupBalancesQueryKey,
  getListPaymentsQueryKey,
  useDeletePayment,
  type Payment,
} from "@workspace/api-client-react";
import { ArrowRight, HandCoins, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import { formatCurrency, formatDate } from "@/lib/format";

export function PaymentDetailDialog({
  payment,
  currentUserId,
  open,
  onOpenChange,
}: {
  payment: Payment;
  currentUserId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteMutation = useDeletePayment();

  const fromMe = currentUserId && payment.fromUserId === currentUserId;
  const toMe = currentUserId && payment.toUserId === currentUserId;
  const fromName = fromMe ? "You" : payment.fromUser?.name ?? "Someone";
  const toName = toMe ? "you" : payment.toUser?.name ?? "someone";
  const amount = Number(payment.amount);

  const onDelete = () => {
    deleteMutation.mutate(
      { paymentId: payment.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: ["non-group-expenses"] });
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          queryClient.invalidateQueries({ queryKey: ["friend-activity"] });
          if (payment.groupId) {
            queryClient.invalidateQueries({
              queryKey: getListPaymentsQueryKey(payment.groupId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetGroupBalancesQueryKey(payment.groupId),
            });
          }
          toast({ title: "Payment deleted" });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "Couldn't delete payment",
            description: getErrorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment details</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-col items-center text-center gap-2 pt-2">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <HandCoins className="w-6 h-6 text-green-700" />
            </div>
            <p className="text-3xl font-semibold text-green-700">
              {formatCurrency(amount, payment.currency || "USD")}
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{fromName}</span>
              <ArrowRight className="w-4 h-4" />
              <span className="font-medium text-foreground capitalize">
                {toName}
              </span>
            </div>
          </div>

          <div className="rounded-md border divide-y text-sm">
            <Row label="Date" value={formatDate(payment.date)} />
            {payment.note ? (
              <Row label="Note" value={payment.note} />
            ) : null}
            <Row
              label="Type"
              value={payment.groupId ? "Group payment" : "Non-group payment"}
            />
            <Row label="Recorded" value={formatDate(payment.createdAt)} />
          </div>

        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                <AlertDialogDescription>
                  Removing this payment will recalculate balances for everyone
                  involved.
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
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{value}</span>
    </div>
  );
}
