import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Plane,
  Home,
  Heart,
  Sparkles,
  Wallet,
  Users,
  Bell,
  PieChart,
  Globe,
  ShieldCheck,
  Smartphone,
  ArrowRight,
} from "lucide-react";

function Logo() {
  return (
    <div className="flex items-center gap-2 font-bold text-2xl text-primary" data-testid="brand-logo">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-7 h-7 sm:w-8 sm:h-8"
        aria-hidden
      >
        <path d="M12 2v20" />
        <path d="M18 6l4 6-4 6" />
        <path d="M6 18l-4-6 4-6" />
      </svg>
      Splitix
    </div>
  );
}

function PhoneMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[260px] sm:w-[300px] md:w-[320px] aspect-[9/19] rounded-[2.5rem] border-[10px] border-neutral-900 bg-white shadow-2xl overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-24 bg-neutral-900 rounded-b-2xl z-10" />
      <div className="h-full w-full p-4 pt-8 flex flex-col">{children}</div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost" className="text-primary hover:text-primary" data-testid="link-login">
              <Link href="/sign-in">Log in</Link>
            </Button>
            <Button asChild className="rounded-full px-4 sm:px-6" data-testid="link-signup">
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
            <div className="text-center md:text-left">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
                Money with friends,{" "}
                <span className="text-primary">finally drama-free.</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto md:mx-0">
                Splitix is the easiest way to track shared bills, split costs fairly, and settle up with the people who matter — roommates, road trips, dinners, and everything in between.
              </p>

              <div className="mt-6 flex items-center justify-center md:justify-start gap-3 text-primary">
                <Plane className="w-6 h-6" aria-hidden />
                <Home className="w-6 h-6 text-purple-500" aria-hidden />
                <Heart className="w-6 h-6 text-rose-400" aria-hidden />
                <Sparkles className="w-6 h-6 text-amber-500" aria-hidden />
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Button asChild size="lg" className="rounded-full text-base px-8 py-6 w-full sm:w-auto" data-testid="cta-hero-signup">
                  <Link href="/sign-up">
                    Get started — it's free
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full text-base px-8 py-6 w-full sm:w-auto" data-testid="cta-hero-login">
                  <Link href="/sign-in">I already have an account</Link>
                </Button>
              </div>

              <p className="mt-5 text-sm text-muted-foreground flex items-center justify-center md:justify-start gap-2">
                <Smartphone className="w-4 h-4" aria-hidden />
                Available on web, iOS, and Android.
              </p>
            </div>

            {/* Hero illustration */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 -z-10 flex items-center justify-center">
                <div className="w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-primary/20 blur-3xl" />
              </div>
              <div className="grid grid-cols-6 gap-1.5 sm:gap-2 rotate-[18deg] scale-90 sm:scale-100">
                {Array.from({ length: 42 }).map((_, i) => {
                  const shades = ["bg-primary/90", "bg-primary/70", "bg-primary/50", "bg-primary/30"];
                  return (
                    <div
                      key={i}
                      className={`${shades[i % shades.length]} ${i % 3 === 0 ? "rounded-tl-2xl" : ""} h-8 w-8 sm:h-10 sm:w-10`}
                      aria-hidden
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Two-up feature blocks */}
        <section className="grid md:grid-cols-2">
          <div className="bg-neutral-900 text-white px-6 py-16 sm:py-20 flex flex-col items-center text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Always know where you stand</h2>
            <p className="mt-3 max-w-md text-neutral-300">
              See exactly who owes who, in any currency, the moment expenses are added. No spreadsheets, no awkward math.
            </p>
            <div className="mt-10">
              <PhoneMock>
                <div className="text-xs text-neutral-400">Friends</div>
                <div className="mt-3 rounded-xl bg-neutral-50 p-3 shadow-sm">
                  <div className="text-[10px] text-neutral-500">Total balance</div>
                  <div className="text-rose-600 text-sm font-semibold">You owe €92.21</div>
                  <div className="text-emerald-600 text-sm font-semibold">You're owed $69.77</div>
                </div>
                <div className="mt-3 space-y-2">
                  {["Alex", "Priya", "Sam"].map((n) => (
                    <div key={n} className="flex items-center justify-between rounded-lg border p-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                          {n[0]}
                        </div>
                        <span className="text-xs font-medium text-neutral-800">{n}</span>
                      </div>
                      <span className="text-xs text-emerald-600 font-semibold">+ $14.20</span>
                    </div>
                  ))}
                </div>
              </PhoneMock>
            </div>
          </div>

          <div className="bg-primary text-primary-foreground px-6 py-16 sm:py-20 flex flex-col items-center text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Split anything, with anyone</h2>
            <p className="mt-3 max-w-md text-primary-foreground/90">
              Equal, percentage, shares, or exact amounts — split bills however your group rolls. Add receipts, notes, and categories in seconds.
            </p>
            <div className="mt-10">
              <PhoneMock>
                <div className="text-xs text-neutral-500">Goa Trip</div>
                <div className="mt-3 rounded-xl bg-rose-50 p-3">
                  <div className="text-[10px] text-rose-500">Recent expense</div>
                  <div className="text-sm font-semibold text-neutral-800">Beachside dinner · ₹4,800</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">Paid by Priya · Split equally</div>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {[
                    { l: "Equal split", v: "4 people" },
                    { l: "Your share", v: "₹1,200" },
                    { l: "Category", v: "Food & drink" },
                  ].map((r) => (
                    <div key={r.l} className="flex justify-between border-b py-1.5 text-neutral-700">
                      <span>{r.l}</span>
                      <span className="font-semibold">{r.v}</span>
                    </div>
                  ))}
                </div>
              </PhoneMock>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="bg-background">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Built for real life, not accountants
              </h2>
              <p className="mt-4 text-muted-foreground">
                Whether it's a weekend getaway or the rent every month, Splitix keeps everyone on the same page — automatically.
              </p>
            </div>

            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: Wallet,
                  title: "Settle up in one tap",
                  body: "Record cash, UPI, or any payment to mark balances as paid. Splitix updates everyone instantly.",
                },
                {
                  icon: Users,
                  title: "Groups for any occasion",
                  body: "Trips, flatmates, partners, parents — make a group, invite people with a code, and start splitting.",
                },
                {
                  icon: Globe,
                  title: "Multi-currency support",
                  body: "Spend in dollars, settle in rupees. Each group has its own currency and totals roll up by currency.",
                },
                {
                  icon: PieChart,
                  title: "Smart breakdowns",
                  body: "Equal, exact, percentage, or share-based splits. See per-person totals before you save the expense.",
                },
                {
                  icon: Bell,
                  title: "Stay in the loop",
                  body: "Get notified the moment someone adds an expense, settles up, or invites you to a new group.",
                },
                {
                  icon: ShieldCheck,
                  title: "Private by default",
                  body: "Your balances stay between you and the people you share with. No ads, no selling your data.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow"
                  data-testid={`feature-${title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-5 h-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-lg">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA banner */}
        <section className="bg-primary/10 border-y">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Stop chasing friends for money.
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Sign up free in under a minute and bring everyone you split with — no credit card, no nonsense.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="rounded-full text-base px-8 py-6 w-full sm:w-auto" data-testid="cta-bottom-signup">
                <Link href="/sign-up">
                  Create your free account
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} Splitix. Built with care for friends, flatmates, and frequent travellers.
          </p>
        </div>
      </footer>
    </div>
  );
}
