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
          <div className="flex-1">
            <h1 className="text-xl font-bold">Your referrals</h1>
            <p className="text-xs text-muted-foreground">
              People who joined Splitix using your invite link.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Total referred users</div>
            <div className="text-2xl font-bold leading-tight">
              {isLoading ? "—" : (data?.count ?? 0)}
            </div>
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
