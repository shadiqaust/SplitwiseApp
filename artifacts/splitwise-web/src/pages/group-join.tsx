import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error";
import {
  getGetGroupBalancesQueryKey,
  getGetGroupByInviteQueryKey,
  getGetGroupQueryKey,
  getListGroupsQueryKey,
  useGetGroupByInvite,
  useGetMe,
  useIncludeMemberInPastExpenses,
  useJoinGroup,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Smartphone, Users } from "lucide-react";
import { resolveAvatarUrl } from "@/lib/avatar-presets";

const APP_SCHEME = "splitwise-mobile";

function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function GroupJoinPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const { toast } = useToast();

  const isMobile = detectMobile();
  const appUrl = `${APP_SCHEME}://groups/join/${code}`;
  const triedOpenAppRef = useRef(false);

  const openInApp = () => {
    if (!code) return;
    // Setting window.location to a custom scheme silently no-ops if the app
    // isn't installed; the browser stays on this page. If the app IS installed,
    // the OS will intercept and switch to it.
    window.location.href = appUrl;
  };

  // On mobile, try to open the app automatically once on mount.
  useEffect(() => {
    if (!isMobile || !code || triedOpenAppRef.current) return;
    triedOpenAppRef.current = true;
    openInApp();
    // openInApp deps are stable per mount (code is from URL); intentionally omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, code]);

  // Bounce unauthenticated users to sign-in, preserving the invite link.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const target = encodeURIComponent(`/groups/join/${code}`);
      setLocation(`/sign-in?next=${target}`);
    }
  }, [isLoaded, isSignedIn, code, setLocation]);

  const preview = useGetGroupByInvite(code, {
    query: { enabled: Boolean(code) && isLoaded && isSignedIn, retry: false },
  });

  const me = useGetMe();
  const join = useJoinGroup();
  const includeInPast = useIncludeMemberInPastExpenses();
  const [submitting, setSubmitting] = useState(false);
  const [confirmCtx, setConfirmCtx] = useState<
    { groupId: string; myUserId: string } | null
  >(null);

  const goToGroup = (groupId: string) => {
    setConfirmCtx(null);
    setLocation(`/groups/${groupId}`);
  };

  const handleJoin = async () => {
    setSubmitting(true);
    try {
      const group = await join.mutateAsync({ data: { inviteCode: code } });
      await queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetGroupByInviteQueryKey(code) });
      toast({ title: `Joined ${group.name}` });
      // Make sure we have the joiner's own DB user id before deciding whether
      // to prompt — falls back to a refetch if `me` hasn't resolved yet.
      let myUserId = me.data?.id;
      if (!myUserId) {
        try {
          const refetched = await me.refetch();
          myUserId = refetched.data?.id;
        } catch {
          // ignore — handled below
        }
      }
      if (myUserId) {
        setConfirmCtx({ groupId: group.id, myUserId });
      } else {
        // Couldn't resolve current user — open the group rather than block.
        setLocation(`/groups/${group.id}`);
      }
    } catch (err) {
      toast({
        title: "Could not join group",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmIncludeSelf = () => {
    if (!confirmCtx) return;
    const { groupId, myUserId } = confirmCtx;
    includeInPast.mutate(
      { groupId, data: { userId: myUserId } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
          queryClient.invalidateQueries({ queryKey: getGetGroupBalancesQueryKey(groupId) });
          if (result.updatedCount === 0 && result.totalCount === 0) {
            toast({ title: "No past expenses to update" });
          } else if (result.updatedCount === 0) {
            toast({
              title: "Nothing to update",
              description: `All ${result.totalCount} expense(s) use exact or percentage splits and were left unchanged.`,
            });
          } else {
            const skipNote = result.skippedNonEqualCount > 0
              ? ` (${result.skippedNonEqualCount} exact/percentage split(s) left unchanged)`
              : "";
            toast({
              title: `You were added to ${result.updatedCount} past expense(s)`,
              description: `Balances have been recalculated${skipNote}.`,
            });
          }
          goToGroup(groupId);
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to update past expenses",
            description: getErrorMessage(err),
            variant: "destructive",
          });
          goToGroup(groupId);
        },
      },
    );
  };

  if (!isLoaded || !isSignedIn) return null;

  return (
    <Layout>
      <div className="max-w-md mx-auto py-12 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Join a group</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isMobile && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-3">
                <Smartphone className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Have the Splitix app?</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Open this invite directly in the app.
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={openInApp}>
                  Open in app
                </Button>
              </div>
            )}
            {preview.isLoading && (
              <div className="text-sm text-muted-foreground">Looking up invite…</div>
            )}
            {preview.error && (
              <div className="text-sm text-destructive">
                This invite link is invalid or has expired.
              </div>
            )}
            {preview.data && (
              <>
                <div className="flex items-center gap-3">
                  {preview.data.avatarUrl ? (
                    <img
                      src={resolveAvatarUrl(preview.data.avatarUrl) ?? preview.data.avatarUrl}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover bg-muted"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                      <Users className="w-7 h-7 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-lg">{preview.data.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {preview.data.memberCount} member
                      {preview.data.memberCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                {preview.data.description && (
                  <p className="text-sm text-muted-foreground">{preview.data.description}</p>
                )}
                {preview.data.alreadyMember ? (
                  <Button
                    className="w-full"
                    onClick={() => setLocation(`/groups/${preview.data!.id}`)}
                  >
                    Open group
                  </Button>
                ) : (
                  <Button className="w-full" onClick={handleJoin} disabled={submitting}>
                    {submitting ? "Joining…" : "Join group"}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={confirmCtx !== null}
        onOpenChange={(o) => {
          if (!o && confirmCtx && !includeInPast.isPending) {
            // Treat closing the dialog (X / overlay click) the same as
            // "only future expenses": just open the group.
            goToGroup(confirmCtx.groupId);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Include yourself in past expenses?</AlertDialogTitle>
            <AlertDialogDescription>
              This will re-split every existing equal-split expense in this group to include you,
              and recalculate balances. Expenses with exact or percentage splits will be left unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={includeInPast.isPending}
              onClick={() => confirmCtx && goToGroup(confirmCtx.groupId)}
            >
              No, only future expenses
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={includeInPast.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleConfirmIncludeSelf();
              }}
            >
              {includeInPast.isPending ? "Updating…" : "Yes, re-split past expenses"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
