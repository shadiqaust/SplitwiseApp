import { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const e = err as { errors: Array<{ message: string }> };
    return e.errors?.[0]?.message ?? "An error occurred";
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

type AuthMode = "sign-in" | "sign-up" | "verify";

export function AuthPage({ initialMode }: { initialMode: "sign-in" | "sign-up" }) {
  const [, setLocation] = useLocation();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoaded = signInLoaded && signUpLoaded;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || !setSignInActive) return;
    setError(null);
    setLoading(true);
    try {
      const attempt = await signIn.create({ identifier: email, password });
      if (attempt.status === "complete") {
        await setSignInActive({ session: attempt.createdSessionId });
        setLocation("/dashboard");
      } else {
        setError("Sign-in could not be completed. Please try again.");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp) return;
    setError(null);
    setLoading(true);
    try {
      const [first, ...rest] = name.trim().split(/\s+/);
      await signUp.create({
        emailAddress: email,
        password,
        firstName: first || undefined,
        lastName: rest.join(" ") || undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setMode("verify");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp || !setSignUpActive) return;
    setError(null);
    setLoading(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status === "complete") {
        await setSignUpActive({ session: attempt.createdSessionId });
        setLocation("/dashboard");
      } else {
        setError("Verification incomplete. Please check the code and try again.");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: "sign-in" | "sign-up") => {
    setError(null);
    setMode(newMode);
    setEmail("");
    setPassword("");
    setName("");
    setCode("");
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <Link href="/" className="flex items-center gap-2 font-bold text-2xl text-primary mb-8">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M12 2v20"/>
          <path d="M18 6l4 6-4 6"/>
          <path d="M6 18l-4-6 4-6"/>
        </svg>
        Splitwise
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create an account" : "Check your email"}
          </CardTitle>
          <CardDescription>
            {mode === "sign-in"
              ? "Sign in to your Splitwise account"
              : mode === "sign-up"
              ? "Start sharing expenses with friends"
              : `We sent a 6-digit code to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "sign-in" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                
                  <p className="text-sm text-destructive">{error}</p>
                
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Log in
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <button type="button" onClick={() => switchMode("sign-up")} className="text-primary underline-offset-4 hover:underline font-medium">
                  Sign up
                </button>
              </p>
            </form>
          )}

          {mode === "sign-up" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && (
                
                  <p className="text-sm text-destructive">{error}</p>
                
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create account
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("sign-in")} className="text-primary underline-offset-4 hover:underline font-medium">
                  Log in
                </button>
              </p>
            </form>
          )}

          {mode === "verify" && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                />
              </div>
              {error && (
                
                  <p className="text-sm text-destructive">{error}</p>
                
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify email
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setError(null);
                  setMode("sign-up");
                }}
              >
                Back
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
