import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2 font-bold text-2xl text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <path d="M12 2v20"/>
            <path d="M18 6l4 6-4 6"/>
            <path d="M6 18l-4-6 4-6"/>
          </svg>
          Splitwise
        </div>
        <div className="space-x-4">
          <Link href="/sign-in">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link href="/sign-up">
            <Button>Sign up</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground mb-6">
          Less stress when sharing expenses
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl">
          Keep track of your shared expenses and balances with housemates, trips, groups, friends, and family.
        </p>
        <Link href="/sign-up">
          <Button size="lg" className="text-lg px-8 py-6 rounded-full">
            Get started for free
          </Button>
        </Link>
      </main>
    </div>
  );
}
