import { useState } from "react";
import { Mail, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useGetMe } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export function EmailVerificationBanner({ className }: { className?: string }) {
  const { user, updateUser } = useAuth();
  const { data: me } = useGetMe();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const verifiedAt =
    (me as { emailVerifiedAt?: string | null } | undefined)?.emailVerifiedAt ??
    user?.emailVerifiedAt ??
    null;

  if (!user || verifiedAt || dismissed) return null;

  async function handleResend() {
    setSending(true);
    setMessage(null);
    setIsError(false);
    try {
      const token = localStorage.getItem("sw_auth_token");
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        alreadyVerified?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      if (data.alreadyVerified) {
        updateUser({ emailVerifiedAt: new Date().toISOString() });
        setMessage("Your email is already verified.");
      } else {
        setMessage("Verification email sent. Check your inbox.");
      }
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-800 p-3 mb-4 flex items-start gap-3",
        className,
      )}
      role="alert"
    >
      <Mail className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <p className="font-medium text-sm">Verify your email address</p>
          <p className="text-xs opacity-90">
            We sent a verification link to <span className="font-medium">{user.email}</span>.
            You can browse, but creating expenses, payments, groups, or friends is paused until you confirm.
          </p>
          {message && (
            <p
              className={cn(
                "text-xs mt-1",
                isError ? "text-destructive" : "text-emerald-700 dark:text-emerald-300",
              )}
            >
              {message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleResend}
            disabled={sending}
            className="h-8"
          >
            {sending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Resend email
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="opacity-70 hover:opacity-100 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
