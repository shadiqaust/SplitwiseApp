import { useEffect, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, ArrowLeft, Users } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";

interface MyReferral {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface MyReferralsResponse {
  count: number;
  referrals: MyReferral[];
}

async function fetchMyReferrals(): Promise<MyReferralsResponse> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("sw_auth_token") : null;
  const res = await fetch("/api/users/me/referrals", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.json();
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return <img src={url} alt="" className="w-10 h-10 rounded-full object-cover" />;
  }
  return (
    <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export function MyReferralsPage() {
  // Wouter does not reset scroll on route change, so the page lands at
  // whatever scroll position the previous page (typically /profile, scrolled
  // far down to find the invite link) left behind. The translucent sticky
  // mobile header then covers the top of this page until the user scrolls.
  // Force scroll-to-top synchronously before paint, then again on the next
  // frame to defeat any browser scroll-restoration that fires after mount.
  useLayoutEffect(() => {
    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll("main, [data-scroll-container]").forEach((el) => {
        (el as HTMLElement).scrollTop = 0;
      });
    };
    reset();
    const r1 = requestAnimationFrame(reset);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(reset));
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);

  // Also disable browser scroll restoration globally for SPA navigation —
  // wouter relies on history but doesn't manage scroll itself.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      const prev = window.history.scrollRestoration;
      window.history.scrollRestoration = "manual";
      return () => {
        window.history.scrollRestoration = prev;
      };
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["me", "referrals"],
    queryFn: fetchMyReferrals,
  });

  const referrals = data?.referrals ?? [];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-4">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to profile
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Your referrals</h1>
            <p className="text-xs text-muted-foreground">
              People who joined Splitix using your invite link.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          {isLoading && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {!isLoading && referrals.length === 0 && (
            <div className="p-8 text-center space-y-2">
              <Users className="w-8 h-8 mx-auto text-muted-foreground" />
              <div className="text-sm font-medium">No referrals yet</div>
              <div className="text-xs text-muted-foreground">
                Share your invite link from the profile page to start growing your
                Splitix circle.
              </div>
            </div>
          )}
          {referrals.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 p-3 border-b last:border-b-0"
            >
              <Avatar name={r.name} url={r.avatarUrl} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  Joined {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!isLoading && referrals.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {referrals.length} {referrals.length === 1 ? "person has" : "people have"}{" "}
            joined through your invite link.
          </p>
        )}
      </div>
    </Layout>
  );
}
