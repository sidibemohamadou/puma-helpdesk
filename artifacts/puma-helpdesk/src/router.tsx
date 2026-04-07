import { Switch, Route } from "wouter";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Tickets from "@/pages/tickets";
import TicketNew from "@/pages/ticket-new";
import TicketDetail from "@/pages/ticket-detail";
import Users from "@/pages/users";
import UserNew from "@/pages/user-new";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";

export function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route component={Login} />
      </Switch>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tickets" component={Tickets} />
        <Route path="/tickets/new" component={TicketNew} />
        <Route path="/tickets/:id" component={TicketDetail} />
        {user.role === "admin" && (
          <>
            <Route path="/users" component={Users} />
            <Route path="/users/new" component={UserNew} />
          </>
        )}
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}
