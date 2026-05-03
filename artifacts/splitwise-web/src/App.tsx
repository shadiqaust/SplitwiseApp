import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { LandingPage } from "./pages/landing";
import { Layout } from "./components/layout";
import { AuthPage } from "./pages/auth";

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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in">
        <AuthPage initialMode="sign-in" />
      </Route>
      <Route path="/sign-up">
        <AuthPage initialMode="sign-up" />
      </Route>
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
            <Routes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
