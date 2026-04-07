import { Switch, Route } from "wouter";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Portal from "@/pages/portal";
import Queue from "@/pages/queue";
import Urgent from "@/pages/urgent";
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

  const isAgent = user.role === "agent";
  const isTech = user.role === "technician";
  const isAdmin = user.role === "admin";

  return (
    <Layout>
      <Switch>
        {/* Role-based home */}
        {isAgent && <Route path="/" component={Portal} />}
        {isTech && <Route path="/" component={Queue} />}
        {isAdmin && <Route path="/" component={Dashboard} />}

        {/* Technician routes */}
        {isTech && <Route path="/queue" component={Queue} />}

        {/* Shared routes */}
        {(isTech || isAdmin) && <Route path="/urgent" component={Urgent} />}

        {/* Ticket routes — agents see only their portal on /tickets, but can still open individual tickets */}
        {!isAgent && <Route path="/tickets" component={Tickets} />}
        <Route path="/tickets/new" component={TicketNew} />
        <Route path="/tickets/:id" component={TicketDetail} />

        {/* Admin-only */}
        {isAdmin && <Route path="/users" component={Users} />}
        {isAdmin && <Route path="/users/new" component={UserNew} />}

        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}
