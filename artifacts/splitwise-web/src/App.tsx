import { useEffect, useLayoutEffect } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { setDisplayCurrency, useDisplayCurrency } from "./lib/format";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { LandingPage } from "./pages/landing";
import { Layout } from "./components/layout";
import { AuthPage } from "./pages/auth";
import { VerifyEmailPage } from "./pages/verify-email";

import { DashboardPage } from "./pages/dashboard";
import { GroupsPage } from "./pages/groups";
import { NewGroupPage } from "./pages/group-new";
import { GroupDetailPage } from "./pages/group-detail";
import { GroupJoinPage } from "./pages/group-join";
import { ProfilePage } from "./pages/profile";
import { FriendsPage } from "./pages/friends";
import { FriendDetailPage } from "./pages/friend-detail";
import { NonGroupExpensesPage } from "./pages/non-group-expenses";
import { ExpenseDetailPage } from "./pages/expense-detail";
import { ExpenseEditPage } from "./pages/expense-edit";
import { AdminOverviewPage } from "./pages/admin/overview";
import { AdminUsersPage } from "./pages/admin/users";
import { AdminUserDetailPage } from "./pages/admin/user-detail";
import { AdminCurrenciesPage } from "./pages/admin/currencies";
import { AdminNotificationsPage } from "./pages/admin/notifications";
import { AdminReferralsPage } from "./pages/admin/referrals";
import { AdminEmailSettingsPage } from "./pages/admin/email-settings";
import { MyReferralsPage } from "./pages/my-referrals";

const REF_KEY = "sw_pending_ref";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Capture `?ref=<userId>` from any landing URL into sessionStorage so it
// survives the landing → /sign-up navigation. Cleared on successful signup.
function ReferralCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && UUID_RE.test(ref)) {
        sessionStorage.setItem(REF_KEY, ref);
      }
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, []);
  return null;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Reset scroll on every route change. Wouter doesn't do this by default and
// the layout's <main> is its own scroll container on mobile, so without this
// the new page can land mid-scroll and have its top hidden behind the
// translucent sticky header. Runs synchronously before paint.
function ScrollToTop() {
  const [location] = useLocation();
  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document
      .querySelectorAll("main, [data-scroll-container]")
      .forEach((el) => {
        (el as HTMLElement).scrollTop = 0;
      });
  }, [location]);
  return null;
}

// Sync the viewer's default currency into the format module so every
// formatCurrency / getCurrencySymbol call renders amounts with the user's
// own symbol regardless of what's stored on the expense/group/payment.
function DisplayCurrencyBridge() {
  // Only call useGetMe once we have a token. Firing it before AuthProvider's
  // mount effect has restored the token from localStorage causes an
  // unauthenticated request, a 401, and the global handler signing the
  // user out on every page refresh.
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return <DisplayCurrencyBridgeInner />;
}

function DisplayCurrencyBridgeInner() {
  const me = useGetMe();
  const next = me.data?.defaultCurrency;
  // Push the latest defaultCurrency into the format module after commit so
  // notifying subscribers doesn't trigger an update during render.
  useEffect(() => {
    if (next) setDisplayCurrency(next);
  }, [next]);
  return null;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <LandingPage />;
}

function NotFound() {
  return <Layout><div>Not Found</div></Layout>;
}

function Routes() {
  // Subscribe so the entire route tree re-renders when the viewer's
  // preferred currency changes (formatCurrency reads it from a module store).
  useDisplayCurrency();
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in">
        <AuthPage initialMode="sign-in" />
      </Route>
      <Route path="/sign-up">
        <AuthPage initialMode="sign-up" />
      </Route>
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/dashboard">
        <PrivateRoute><DashboardPage /></PrivateRoute>
      </Route>
      <Route path="/groups">
        <PrivateRoute><GroupsPage /></PrivateRoute>
      </Route>
      <Route path="/groups/new">
        <PrivateRoute><NewGroupPage /></PrivateRoute>
      </Route>
      <Route path="/groups/join/:code">
        <PrivateRoute><GroupJoinPage /></PrivateRoute>
      </Route>
      <Route path="/groups/:groupId">
        <PrivateRoute><GroupDetailPage /></PrivateRoute>
      </Route>
      <Route path="/non-group-expenses">
        <PrivateRoute><NonGroupExpensesPage /></PrivateRoute>
      </Route>
      <Route path="/expenses/:expenseId/edit">
        <PrivateRoute><ExpenseEditPage /></PrivateRoute>
      </Route>
      <Route path="/expenses/:expenseId">
        <PrivateRoute><ExpenseDetailPage /></PrivateRoute>
      </Route>
      <Route path="/friends">
        <PrivateRoute><FriendsPage /></PrivateRoute>
      </Route>
      <Route path="/friends/:friendId">
        <PrivateRoute><FriendDetailPage /></PrivateRoute>
      </Route>
      <Route path="/profile">
        <PrivateRoute><ProfilePage /></PrivateRoute>
      </Route>
      <Route path="/my-referrals">
        <PrivateRoute><MyReferralsPage /></PrivateRoute>
      </Route>
      <Route path="/admin">
        <PrivateRoute><AdminOverviewPage /></PrivateRoute>
      </Route>
      <Route path="/admin/users">
        <PrivateRoute><AdminUsersPage /></PrivateRoute>
      </Route>
      <Route path="/admin/users/:userId">
        <PrivateRoute><AdminUserDetailPage /></PrivateRoute>
      </Route>
      <Route path="/admin/currencies">
        <PrivateRoute><AdminCurrenciesPage /></PrivateRoute>
      </Route>
      <Route path="/admin/notifications">
        <PrivateRoute><AdminNotificationsPage /></PrivateRoute>
      </Route>
      <Route path="/admin/referrals">
        <PrivateRoute><AdminReferralsPage /></PrivateRoute>
      </Route>
      <Route path="/admin/email-settings">
        <PrivateRoute><AdminEmailSettingsPage /></PrivateRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <DisplayCurrencyBridge />
            <ReferralCapture />
            <ScrollToTop />
            <Routes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
