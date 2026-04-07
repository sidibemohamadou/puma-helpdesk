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
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoggingOut } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/tickets", label: "Tickets", icon: Ticket, exact: false },
    ...(user?.role === "admin" ? [{ href: "/users", label: "Users", icon: Users, exact: false }] : []),
  ];

  const NavLinks = () => (
    <div className="space-y-1">
      {navItems.map((item) => {
        const isActive = item.exact ? location === item.href : location.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors cursor-pointer group ${
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </div>
              {isActive && <ChevronRight className="h-4 w-4 opacity-50" />}
            </div>
          </Link>
        );
      })}
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
            <div className="p-6">
              <div className="flex items-center gap-2 font-bold text-xl text-primary tracking-tight mb-8">
                <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-black">
                  PU
                </div>
                PUMA IT
              </div>
              <NavLinks />
            </div>
            
            <div className="mt-auto p-4 border-t bg-muted/30">
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-10 w-10 border border-border">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {user ? getInitials(user.name) : "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{user?.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/profile" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs font-medium">
                    <User className="h-3 w-3 mr-2" />
                    Profile
                  </Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => logout()}
                  disabled={isLoggingOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card h-[100dvh] sticky top-0 shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-2 font-bold text-xl text-primary tracking-tight mb-8">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-black shadow-sm">
              PU
            </div>
            PUMA IT
          </div>
          <NavLinks />
        </div>
        
        <div className="mt-auto p-4 border-t bg-muted/30">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-10 w-10 border shadow-sm">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {user ? getInitials(user.name) : "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{user?.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/profile" className="flex-1">
              <Button variant="outline" size="sm" className="w-full justify-start text-xs font-medium shadow-sm">
                <User className="h-3 w-3 mr-2" />
                Profile
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="icon" 
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => logout()}
              disabled={isLoggingOut}
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
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
