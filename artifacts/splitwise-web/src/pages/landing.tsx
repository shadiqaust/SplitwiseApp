import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Zap,
  Shield,
  Globe,
  Users,
  Bell,
  TrendingUp,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";

function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-bold text-xl tracking-tight" data-testid="brand-logo">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4.5 h-4.5"
        >
          <path d="M12 2v20" />
          <path d="M18 6l4 6-4 6" />
          <path d="M6 18l-4-6 4-6" />
        </svg>
      </div>
      <span className="bg-gradient-to-r from-amber-600 to-rose-500 bg-clip-text text-transparent">
        Splitix
      </span>
    </div>
  );
}

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          let start = 0;
          const duration = 1500;
          const step = (timestamp: number) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            setCount(Math.floor(progress * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/80 backdrop-blur-xl shadow-sm border-b border-neutral-100"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between px-5 sm:px-8 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              className="text-neutral-600 hover:text-neutral-900 font-medium"
              data-testid="link-login"
            >
              <Link href="/sign-in">Log in</Link>
            </Button>
            <Button
              asChild
              className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg px-5 font-medium"
              data-testid="link-signup"
            >
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-neutral-50 via-white to-white pt-28 sm:pt-36 pb-20 sm:pb-28">
          {/* Background pattern */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-rose-100/60 rounded-full blur-3xl" />
            <div className="absolute top-1/2 -left-20 w-72 h-72 bg-amber-100/50 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
            <div className="max-w-3xl mx-auto text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200/60 text-amber-700 text-sm font-medium mb-8">
                <Zap className="w-4 h-4" />
                Free forever for personal use
              </div>

              <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-neutral-900 leading-[1.1]">
                Split expenses.
                <br />
                <span className="bg-gradient-to-r from-amber-600 via-rose-500 to-purple-600 bg-clip-text text-transparent">
                  Keep the friendship.
                </span>
              </h1>

              <p className="mt-6 text-lg sm:text-xl text-neutral-500 max-w-2xl mx-auto leading-relaxed">
                Track shared bills, split costs fairly, and settle up without the awkwardness. Built for roommates, travelers, and anyone who shares money.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white rounded-xl text-base px-8 h-14 shadow-lg shadow-rose-500/20"
                  data-testid="cta-hero-signup"
                >
                  <Link href="/sign-up">
                    Get started free
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-xl text-base px-8 h-14 border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                  data-testid="cta-hero-login"
                >
                  <Link href="/sign-in">I have an account</Link>
                </Button>
              </div>

              {/* Social proof */}
              <div className="mt-12 flex items-center justify-center gap-6 text-sm text-neutral-400">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>No credit card</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Sign up in 30 seconds</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Available on all devices</span>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
            <ChevronDown className="w-5 h-5 text-neutral-300" />
          </div>
        </section>

        {/* Demo video */}
        <section className="bg-white border-y border-neutral-100">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
                See how it works
              </h2>
              <p className="mt-3 text-neutral-500 text-lg">
                A quick tour of splitting, tracking, and settling up.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border shadow-2xl shadow-neutral-200/50 bg-neutral-900">
              <div className="relative w-full aspect-video">
                <iframe
                  src="/splitix-demo/"
                  title="Splitix product demo"
                  className="absolute inset-0 w-full h-full"
                  loading="lazy"
                  allow="autoplay; fullscreen"
                  data-testid="iframe-demo-video"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="bg-neutral-900 text-white py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { value: 50000, suffix: "+", label: "Expenses tracked" },
                { value: 1200, suffix: "+", label: "Active groups" },
                { value: 50, suffix: "+", label: "Currencies" },
                { value: 99, suffix: "%", label: "Uptime" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="mt-2 text-neutral-400 text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="bg-white py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
                Everything you need
              </h2>
              <p className="mt-4 text-neutral-500 text-lg">
                No spreadsheets, no awkward math. Just split, track, and settle.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Zap,
                  title: "Instant splitting",
                  body: "Equal, percentage, exact amounts, or shares. Choose how you split and see everyone's share before saving.",
                  color: "from-amber-500 to-orange-500",
                },
                {
                  icon: Users,
                  title: "Groups & friends",
                  body: "Create groups for trips, roommates, or events. Or track expenses with individual friends one-on-one.",
                  color: "from-rose-500 to-pink-500",
                },
                {
                  icon: Globe,
                  title: "Multi-currency",
                  body: "Track expenses in dollars, euros, rupees, or any currency. Each group keeps its own currency.",
                  color: "from-purple-500 to-indigo-500",
                },
                {
                  icon: TrendingUp,
                  title: "Smart balances",
                  body: "See exactly who owes who at a glance. Automatic settlement suggestions to minimize transactions.",
                  color: "from-emerald-500 to-teal-500",
                },
                {
                  icon: Bell,
                  title: "Real-time updates",
                  body: "Get notified when someone adds an expense, settles up, or invites you to a new group.",
                  color: "from-blue-500 to-cyan-500",
                },
                {
                  icon: Shield,
                  title: "Private & secure",
                  body: "Your data stays between you and your group. No ads, no data selling, no third-party tracking.",
                  color: "from-neutral-600 to-neutral-800",
                },
              ].map(({ icon: Icon, title, body, color }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-neutral-100 bg-white p-7 hover:shadow-xl hover:shadow-neutral-200/50 transition-all duration-300 hover:-translate-y-1"
                  data-testid={`feature-${title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-lg`}>
                    <Icon className="w-5 h-5" aria-hidden />
                  </div>
                  <h3 className="mt-5 font-semibold text-lg text-neutral-900">{title}</h3>
                  <p className="mt-2 text-neutral-500 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Two-up feature showcase */}
        <section className="bg-neutral-50">
          <div className="grid lg:grid-cols-2">
            <div className="px-8 sm:px-12 py-16 sm:py-24 flex flex-col justify-center">
              <h3 className="text-2xl sm:text-3xl font-bold text-neutral-900">
                Always know where you stand
              </h3>
              <p className="mt-4 text-neutral-500 leading-relaxed max-w-md">
                Real-time balance updates show exactly who owes who. No more "did you pay me back?" conversations. No more forgotten IOUs.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Per-person balances in every group",
                  "Settlement suggestions to minimize transfers",
                  "Payment history and receipts",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-neutral-700">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-rose-50 px-8 sm:px-12 py-16 sm:py-24 flex items-center justify-center">
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-neutral-200/50 p-6 border border-neutral-100">
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Group Balance
                </div>
                {[
                  { name: "Alex", avatar: "A", balance: "+ $42.00", positive: true },
                  { name: "Priya", avatar: "P", balance: "- $28.50", positive: false },
                  { name: "Sam", avatar: "S", balance: "- $13.50", positive: false },
                ].map((person) => (
                  <div
                    key={person.name}
                    className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center text-white text-sm font-bold">
                        {person.avatar}
                      </div>
                      <span className="font-medium text-neutral-800">{person.name}</span>
                    </div>
                    <span
                      className={`font-semibold ${
                        person.positive ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {person.balance}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 py-20 sm:py-28">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight">
              Stop chasing friends for money.
            </h2>
            <p className="mt-4 text-neutral-400 text-lg max-w-xl mx-auto">
              Join thousands of people who use Splitix to keep their friendships and finances in check.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white rounded-xl text-base px-8 h-14 shadow-lg shadow-rose-500/20"
                data-testid="cta-bottom-signup"
              >
                <Link href="/sign-up">
                  Create your free account
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-neutral-500 text-sm">
              No credit card required. Takes less than a minute.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-100">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-sm text-neutral-400">
            &copy; {new Date().getFullYear()} Splitix. Built for people who share.
          </p>
        </div>
      </footer>
    </div>
  );
}
