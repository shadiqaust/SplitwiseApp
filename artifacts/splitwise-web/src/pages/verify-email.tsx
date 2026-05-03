import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

type Status = "pending" | "ok" | "error";

export function VerifyEmailPage() {
  const { user, updateUser } = useAuth();
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState<string>("Verifying your email…");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setStatus("error");
          setMessage(data.error ?? "Verification link is invalid or expired.");
          return;
        }
        setStatus("ok");
        setMessage("Your email is verified. You're all set!");
        if (user) updateUser({ emailVerifiedAt: new Date().toISOString() });
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not reach the server. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          {status === "pending" && (
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-muted-foreground" />
          )}
          {status === "ok" && (
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
          )}
          {status === "error" && (
            <XCircle className="w-10 h-10 mx-auto text-destructive" />
          )}
          <CardTitle>
            {status === "pending" && "Verifying…"}
            {status === "ok" && "Email verified"}
            {status === "error" && "Verification failed"}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {status === "ok" && (
            <Link href={user ? "/dashboard" : "/sign-in"}>
              <Button className="w-full">
                {user ? "Go to dashboard" : "Sign in"}
              </Button>
            </Link>
          )}
          {status === "error" && (
            <Link href={user ? "/dashboard" : "/sign-in"}>
              <Button variant="outline" className="w-full">
                {user ? "Back to dashboard" : "Back to sign in"}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
