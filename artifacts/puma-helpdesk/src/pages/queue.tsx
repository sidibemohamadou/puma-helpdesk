import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTickets,
  useUpdateTicket,
  getListTicketsQueryKey,
  getGetTicketQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryIcon, getCategoryLabel } from "@/components/ui/category-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox,
  MessageSquare,
  ChevronRight,
  UserCheck,
  PlayCircle,
  CheckCircle2,
  Clock,
  Layers,
} from "lucide-react";
import type { Ticket } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Queue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTicket = useUpdateTicket();

  const { data: myTicketsResponse, isLoading: myLoading } = useListTickets(
    { assigneeId: user?.id, limit: 50 },
    { query: { queryKey: getListTicketsQueryKey({ assigneeId: user?.id, limit: 50 }) } }
  );

  const { data: unassignedResponse, isLoading: unassignedLoading } = useListTickets(
    { status: "open", limit: 50 },
    { query: { queryKey: getListTicketsQueryKey({ status: "open", limit: 50 }) } }
  );

  const myTickets: Ticket[] = ((myTicketsResponse as any)?.tickets ?? []).filter(
    (t: Ticket) => !["resolved", "closed"].includes(t.status)
  );
  const allOpen: Ticket[] = (unassignedResponse as any)?.tickets ?? [];
  const unassigned: Ticket[] = allOpen.filter((t: Ticket) => !t.assigneeId);

  const handleTake = (ticketId: number) => {
    updateTicket.mutate(
      { id: ticketId, data: { assigneeId: user?.id, status: "in_progress" } },
      {
        onSuccess: () => {
          toast({ title: "Ticket pris en charge" });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
        },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  const handleResolve = (ticketId: number) => {
    updateTicket.mutate(
      { id: ticketId, data: { status: "resolved" } },
      {
        onSuccess: () => {
          toast({ title: "Ticket marqué résolu" });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
        },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  const TicketRow = ({ ticket, showTake }: { ticket: Ticket; showTake?: boolean }) => (
    <div className="flex items-center gap-4 p-4 border rounded-xl bg-card hover:shadow-sm transition-all group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {ticket.priority === "critical" && (
            <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded font-bold animate-pulse">
              URGENT
            </span>
          )}
          <Link href={`/tickets/${ticket.id}`}>
            <span className="font-semibold text-foreground group-hover:text-primary transition-colors cursor-pointer hover:underline">
              {ticket.title}
            </span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CategoryIcon category={ticket.category} className="h-3 w-3" />
            {getCategoryLabel(ticket.category)}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(ticket.createdAt)}
          </span>
          <span className="text-xs text-muted-foreground">
            par <strong>{ticket.createdBy.name}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showTake ? (
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => handleTake(ticket.id)}
            disabled={updateTicket.isPending}
          >
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />
            Prendre en charge
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-green-600 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950/30"
            onClick={() => handleResolve(ticket.id)}
            disabled={updateTicket.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Résoudre
          </Button>
        )}
        <Link href={`/tickets/${ticket.id}`}>
          <Button size="sm" variant="outline" className="gap-1 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Ma file de travail</h1>
        <p className="text-muted-foreground mt-1">
          Vos tickets assignés et les demandes en attente d'attribution.
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm text-center">
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-foreground">{myTickets.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Mes tickets actifs</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm text-center border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{unassigned.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Non assignés</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm text-center border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {[...myTickets, ...unassigned].filter((t: Ticket) => t.priority === "critical").length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Critiques</div>
          </CardContent>
        </Card>
      </div>

      {/* My Assigned Tickets */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Mes tickets en cours
            <Badge variant="secondary" className="ml-2 text-xs">{myTickets.length}</Badge>
          </h2>
        </div>

        {myLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : myTickets.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center py-10 text-center gap-2">
              <Inbox className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aucun ticket assigné pour l'instant</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {myTickets
              .sort((a: Ticket, b: Ticket) => {
                const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
              })
              .map((ticket: Ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} showTake={false} />
              ))}
          </div>
        )}
      </div>

      {/* Unassigned Tickets */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-foreground">
            Tickets non assignés
            <Badge variant="secondary" className="ml-2 text-xs">{unassigned.length}</Badge>
          </h2>
        </div>

        {unassignedLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : unassigned.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center py-10 text-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
              <p className="text-sm text-muted-foreground">Tous les tickets sont assignés</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {unassigned
              .sort((a: Ticket, b: Ticket) => {
                const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
              })
              .map((ticket: Ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} showTake={true} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
