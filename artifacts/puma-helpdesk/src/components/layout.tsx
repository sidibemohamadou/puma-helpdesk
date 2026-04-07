import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Ticket,
  Users,
  User,
  LogOut,
  Menu,
  ChevronRight,
  Flame,
  Layers,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useListTickets, getListTicketsQueryKey } from "@workspace/api-client-react";

function UrgentBadge() {
  const { data: criticalRes } = useListTickets(
    { priority: "critical", limit: 50 },
    { query: { queryKey: getListTicketsQueryKey({ priority: "critical", limit: 50 }), staleTime: 30000 } }
  );
  const { data: highRes } = useListTickets(
    { priority: "high", limit: 50 },
    { query: { queryKey: getListTicketsQueryKey({ priority: "high", limit: 50 }), staleTime: 30000 } }
  );
  const count =
    ((criticalRes as any)?.tickets ?? []).filter((t: any) => !["resolved", "closed"].includes(t.status)).length +
    ((highRes as any)?.tickets ?? []).filter((t: any) => !["resolved", "closed"].includes(t.status)).length;

  if (!count) return null;
  return (
    <span className="ml-auto text-xs font-bold bg-red-500 text-white rounded-full px-1.5 min-w-[1.25rem] text-center leading-5 animate-pulse">
      {count}
    </span>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoggingOut } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const role = user?.role;

  const navItems = [
    // Agent portal
    ...(role === "agent"
      ? [
          { href: "/", label: "Mon portail", icon: Home, exact: true },
          { href: "/tickets/new", label: "Nouveau ticket", icon: Ticket, exact: true },
        ]
      : []),
    // Technician
    ...(role === "technician"
      ? [
          { href: "/queue", label: "Ma file", icon: Layers, exact: true },
          { href: "/tickets", label: "Tous les tickets", icon: Ticket, exact: false },
          { href: "/urgent", label: "Urgences", icon: Flame, exact: true, badge: <UrgentBadge /> },
        ]
      : []),
    // Admin
    ...(role === "admin"
      ? [
          { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
          { href: "/tickets", label: "Tous les tickets", icon: Ticket, exact: false },
          { href: "/urgent", label: "Urgences", icon: Flame, exact: true, badge: <UrgentBadge /> },
          { href: "/users", label: "Utilisateurs", icon: Users, exact: false },
        ]
      : []),
  ];

  const NavLinks = () => (
    <div className="space-y-1">
      {navItems.map((item) => {
        const isActive = item.exact ? location === item.href : location.startsWith(item.href);
        const isUrgent = item.href === "/urgent";
        return (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors cursor-pointer group ${
                isActive
                  ? isUrgent
                    ? "bg-red-500 text-white font-medium"
                    : "bg-primary text-primary-foreground font-medium"
                  : isUrgent
                  ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`h-5 w-5 ${isUrgent && !isActive ? "text-red-500" : ""}`} />
                <span>{item.label}</span>
              </div>
              <div className="flex items-center gap-1">
                {(item as any).badge}
                {isActive && !(item as any).badge && (
                  <ChevronRight className="h-4 w-4 opacity-50" />
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );

  const RolePill = () => {
    const labels: Record<string, string> = {
      admin: "Administrateur",
      technician: "Technicien",
      agent: "Agent",
    };
    const colors: Record<string, string> = {
      admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      technician: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      agent: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[role ?? "agent"]}`}>
        {labels[role ?? "agent"]}
      </span>
    );
  };

  const UserSection = () => (
    <div className="mt-auto p-4 border-t bg-muted/30">
      <div className="flex items-center gap-3 mb-4">
        <Avatar className="h-10 w-10 border shadow-sm">
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {user ? getInitials(user.name) : "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0 gap-1">
          <span className="text-sm font-medium truncate">{user?.name}</span>
          <RolePill />
        </div>
      </div>
      <div className="flex gap-2">
        <Link href="/profile" className="flex-1">
          <Button variant="outline" size="sm" className="w-full justify-start text-xs font-medium shadow-sm">
            <User className="h-3 w-3 mr-2" />
            Profil
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => logout()}
          disabled={isLoggingOut}
          title="Déconnexion"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-card z-10 sticky top-0">
        <div className="flex items-center gap-2 font-bold text-lg text-primary tracking-tight">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-black">
            PU
          </div>
          PUMA IT
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 flex flex-col h-full bg-card">
            <div className="p-6 flex-1">
              <div className="flex items-center gap-2 font-bold text-xl text-primary tracking-tight mb-8">
                <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-black">
                  PU
                </div>
                PUMA IT
              </div>
              <NavLinks />
            </div>
            <UserSection />
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card h-[100dvh] sticky top-0 shrink-0">
        <div className="p-6 flex-1">
          <div className="flex items-center gap-2 font-bold text-xl text-primary tracking-tight mb-8">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-black shadow-sm">
              PU
            </div>
            PUMA IT
          </div>
          <NavLinks />
        </div>
        <UserSection />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        <div className="flex-1 p-4 md:p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
