import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTickets,
  useListUsers,
  useUpdateTicket,
  getListTicketsQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { CategoryIcon, getCategoryLabel } from "@/components/ui/category-icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Flame,
  Clock,
  MessageSquare,
  UserCheck,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import type { Ticket, User } from "@workspace/api-client-react/src/generated/api.schemas";

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function Urgent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTicket = useUpdateTicket();
  const canManage = user?.role === "admin" || user?.role === "technician";

  const { data: criticalResponse, isLoading: critLoading } = useListTickets(
    { priority: "critical", limit: 50 },
    { query: { queryKey: getListTicketsQueryKey({ priority: "critical", limit: 50 }) } }
  );
  const { data: highResponse, isLoading: highLoading } = useListTickets(
    { priority: "high", limit: 50 },
    { query: { queryKey: getListTicketsQueryKey({ priority: "high", limit: 50 }) } }
  );
  const { data: techsData } = useListUsers(
    { role: "technician" },
    { query: { enabled: canManage, queryKey: getListUsersQueryKey({ role: "technician" }) } }
  );

  const criticals: Ticket[] = ((criticalResponse as any)?.tickets ?? []).filter(
    (t: Ticket) => !["resolved", "closed"].includes(t.status)
  );
  const highs: Ticket[] = ((highResponse as any)?.tickets ?? []).filter(
    (t: Ticket) => !["resolved", "closed"].includes(t.status)
  );
  const techs: User[] = (techsData as any) ?? [];

  const allUrgent = [...criticals, ...highs].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  );

  const handleAssign = (ticketId: number, techId: number) => {
    updateTicket.mutate(
      { id: ticketId, data: { assigneeId: techId, status: "in_progress" } },
      {
        onSuccess: () => {
          toast({ title: "Ticket assigné" });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
        },
        onError: () => toast({ title: "Erreur lors de l'assignation", variant: "destructive" }),
      }
    );
  };

  const isLoading = critLoading || highLoading;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 flex items-center justify-center shrink-0">
          <Flame className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Tickets Urgents
          </h1>
          <p className="text-muted-foreground mt-1">
            Incidents critiques et haute priorité en attente de traitement.
          </p>
        </div>
      </div>

      {/* Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/25 shadow-sm">
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-black text-red-600 dark:text-red-400">{criticals.length}</div>
            <div className="text-xs font-semibold text-red-700 dark:text-red-400 mt-0.5 uppercase tracking-wide">Critiques</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/25 shadow-sm">
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-black text-orange-600 dark:text-orange-400">{highs.length}</div>
            <div className="text-xs font-semibold text-orange-700 dark:text-orange-400 mt-0.5 uppercase tracking-wide">Haute priorité</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-black text-foreground">
              {allUrgent.filter((t) => !t.assigneeId).length}
            </div>
            <div className="text-xs font-semibold text-muted-foreground mt-0.5 uppercase tracking-wide">Non assignés</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-black text-foreground">
              {allUrgent.filter((t) => t.status === "in_progress").length}
            </div>
            <div className="text-xs font-semibold text-muted-foreground mt-0.5 uppercase tracking-wide">En traitement</div>
          </CardContent>
        </Card>
      </div>

      {/* Ticket List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : allUrgent.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-20 text-center gap-3">
            <ShieldAlert className="h-12 w-12 text-green-400" />
            <div>
              <p className="text-lg font-semibold text-foreground">Aucun incident urgent</p>
              <p className="text-sm text-muted-foreground mt-1">Tous les tickets critiques et haute priorité ont été traités.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allUrgent.map((ticket) => {
            const isCritical = ticket.priority === "critical";
            const ageMs = Date.now() - new Date(ticket.createdAt).getTime();
            const ageHours = ageMs / 3_600_000;
            const isOld = ageHours > 4;

            return (
              <div
                key={ticket.id}
                className={`rounded-xl border shadow-sm overflow-hidden ${
                  isCritical
                    ? "border-red-300 dark:border-red-800/60 bg-red-50/60 dark:bg-red-950/20"
                    : "border-orange-200 dark:border-orange-800/40 bg-orange-50/40 dark:bg-orange-950/10"
                }`}
              >
                {/* Priority stripe */}
                <div className={`h-1 w-full ${isCritical ? "bg-red-500" : "bg-orange-400"}`} />

                <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCritical ? (
                        <span className="flex items-center gap-1 text-xs font-black bg-red-600 text-white px-2 py-0.5 rounded uppercase tracking-widest animate-pulse">
                          <AlertTriangle className="h-3 w-3" /> Critique
                        </span>
                      ) : (
                        <span className="text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                          Haute priorité
                        </span>
                      )}
                      <StatusBadge status={ticket.status} />
                      {isOld && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.round(ageHours)}h sans résolution
                        </span>
                      )}
                    </div>

                    <Link href={`/tickets/${ticket.id}`}>
                      <p className="font-bold text-foreground hover:text-primary cursor-pointer transition-colors text-lg leading-tight">
                        {ticket.title}
                      </p>
                    </Link>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CategoryIcon category={ticket.category} className="h-3 w-3" />
                        {getCategoryLabel(ticket.category)}
                      </span>
                      <span>#{ticket.id.toString().padStart(4, "0")}</span>
                      <span>Soumis par <strong className="text-foreground">{ticket.createdBy.name}</strong></span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(ticket.createdAt)}
                      </span>
                    </div>

                    {ticket.assignee ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserCheck className="h-3.5 w-3.5 text-green-500" />
                        <span>Assigné à <strong className="text-foreground">{ticket.assignee.name}</strong></span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Aucun technicien assigné
                      </div>
                    )}
                  </div>

                  {/* Action column */}
                  <div className="flex flex-col gap-2 sm:items-end shrink-0">
                    <Link href={`/tickets/${ticket.id}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 w-full sm:w-auto">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Voir / Chat
                      </Button>
                    </Link>

                    {canManage && !ticket.assigneeId && techs.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {techs.slice(0, 2).map((tech) => (
                          <Button
                            key={tech.id}
                            size="sm"
                            variant="default"
                            className={`text-xs gap-1 ${isCritical ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
                            onClick={() => handleAssign(ticket.id, tech.id)}
                            disabled={updateTicket.isPending}
                          >
                            <UserCheck className="h-3 w-3" />
                            {tech.name.split(" ")[0]}
                          </Button>
                        ))}
                      </div>
                    )}
                    {canManage && ticket.assigneeId && (
                      <Link href={`/tickets/${ticket.id}`}>
                        <Button size="sm" variant="ghost" className="text-xs gap-1 w-full sm:w-auto">
                          <ChevronRight className="h-3.5 w-3.5" />
                          Gérer
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
