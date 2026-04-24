import { useEffect, useRef } from "react";
import { SignIn, SignUp, Show, useAuth, useClerk } from "@clerk/react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { configureAuth, queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { LandingPage } from "./pages/landing";
import { Layout } from "./components/layout";

import { DashboardPage } from "./pages/dashboard";
import { GroupsPage } from "./pages/groups";
import { NewGroupPage } from "./pages/group-new";
import { GroupDetailPage } from "./pages/group-detail";
import { ProfilePage } from "./pages/profile";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    configureAuth(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
  }, [getToken]);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function NotFound() { return <Layout><div>Not Found</div></Layout>; }

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        
        <Route path="/dashboard">
          <Show when="signed-in"><DashboardPage /></Show>
          <Show when="signed-out"><Redirect to="/" /></Show>
        </Route>
        <Route path="/groups">
          <Show when="signed-in"><GroupsPage /></Show>
          <Show when="signed-out"><Redirect to="/" /></Show>
        </Route>
        <Route path="/groups/new">
          <Show when="signed-in"><NewGroupPage /></Show>
          <Show when="signed-out"><Redirect to="/" /></Show>
        </Route>
        <Route path="/groups/:groupId">
          <Show when="signed-in"><GroupDetailPage /></Show>
          <Show when="signed-out"><Redirect to="/" /></Show>
        </Route>
        <Route path="/profile">
          <Show when="signed-in"><ProfilePage /></Show>
          <Show when="signed-out"><Redirect to="/" /></Show>
        </Route>
        
        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
