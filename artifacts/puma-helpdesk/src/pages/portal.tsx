import { useState } from "react";
import { Link } from "wouter";
import { useListTickets, getListTicketsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  MessageSquare,
  ChevronRight,
  TicketCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  CircleDot,
  Inbox,
} from "lucide-react";
import type { Ticket } from "@workspace/api-client-react/src/generated/api.schemas";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  open: { label: "Ouvert", icon: AlertCircle, color: "text-blue-500" },
  in_progress: { label: "En cours", icon: CircleDot, color: "text-amber-500" },
  pending: { label: "En attente", icon: Clock, color: "text-orange-500" },
  resolved: { label: "Résolu", icon: CheckCircle2, color: "text-green-500" },
  closed: { label: "Fermé", icon: TicketCheck, color: "text-slate-400" },
};

const PRIORITY_CONFIG: Record<string, { color: string }> = {
  low: { color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  medium: { color: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  high: { color: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  critical: { color: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const ACTIVE_STATUSES = ["open", "in_progress", "pending"];

export default function Portal() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"active" | "resolved">("active");

  const { data: ticketsResponse, isLoading } = useListTickets(
    {
      createdById: user?.id,
      limit: 50,
    },
    { query: { queryKey: getListTicketsQueryKey({ createdById: user?.id, limit: 50 }) } }
  );

  const allTickets = (ticketsResponse as any)?.tickets ?? [];
  const activeTickets = allTickets.filter((t: Ticket) => ACTIVE_STATUSES.includes(t.status));
  const resolvedTickets = allTickets.filter((t: Ticket) => !ACTIVE_STATUSES.includes(t.status));
  const displayed = filter === "active" ? activeTickets : resolvedTickets;

  const criticalCount = activeTickets.filter((t: Ticket) => t.priority === "critical").length;

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-8">
      {/* Welcome Header */}
      <div className="pt-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Bonjour, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mt-1">
          Bienvenue sur votre portail de support informatique PUMA.
        </p>
      </div>

      {/* CTA + Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/tickets/new" className="sm:col-span-2">
          <button className="w-full flex items-center justify-between gap-3 bg-primary text-primary-foreground rounded-xl px-6 py-5 shadow-md hover:opacity-90 active:scale-[0.99] transition-all group">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Plus className="h-6 w-6" />
              </div>
              <div className="text-left">
                <div className="text-lg font-bold">Nouveau ticket</div>
                <div className="text-sm opacity-80">Signaler un problème informatique</div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 opacity-60 group-hover:translate-x-1 transition-transform" />
          </button>
        </Link>

        <div className="flex flex-row sm:flex-col gap-3">
          <div className="flex-1 bg-card border rounded-xl px-4 py-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-foreground">{activeTickets.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">En cours</div>
          </div>
          {criticalCount > 0 && (
            <div className="flex-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{criticalCount}</div>
              <div className="text-xs text-red-500 dark:text-red-400 mt-0.5">Critique(s)</div>
            </div>
          )}
          {criticalCount === 0 && (
            <div className="flex-1 bg-card border rounded-xl px-4 py-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{resolvedTickets.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Résolus</div>
            </div>
          )}
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Mes tickets</h2>
          <div className="flex rounded-lg border overflow-hidden text-sm">
            <button
              onClick={() => setFilter("active")}
              className={`px-4 py-1.5 font-medium transition-colors ${
                filter === "active"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              En cours ({activeTickets.length})
            </button>
            <button
              onClick={() => setFilter("resolved")}
              className={`px-4 py-1.5 font-medium transition-colors border-l ${
                filter === "resolved"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Terminés ({resolvedTickets.length})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Inbox className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-foreground">Aucun ticket</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {filter === "active"
                    ? "Vous n'avez aucun ticket en cours."
                    : "Aucun ticket résolu pour le moment."}
                </p>
              </div>
              {filter === "active" && (
                <Link href="/tickets/new">
                  <Button size="sm" className="mt-2">Créer un ticket</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayed.map((ticket: Ticket) => {
              const statusInfo = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
              const StatusIcon = statusInfo.icon;
              const priorityStyle = PRIORITY_CONFIG[ticket.priority]?.color ?? "";

              return (
                <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
                  <Card className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`mt-0.5 shrink-0 ${statusInfo.color}`}>
                          <StatusIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {ticket.title}
                            </p>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityStyle}`}>
                              {ticket.priority === "critical" ? "Critique" :
                               ticket.priority === "high" ? "Haute" :
                               ticket.priority === "medium" ? "Moyenne" : "Faible"}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CategoryIcon category={ticket.category} className="h-3 w-3" />
                              {ticket.category}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(ticket.createdAt)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="text-xs">
                              {ticket.assignee ? (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold shrink-0">
                                    {ticket.assignee.name.charAt(0)}
                                  </span>
                                  Pris en charge par <strong className="text-foreground">{ticket.assignee.name}</strong>
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 text-xs">En attente d'attribution</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MessageSquare className="h-3 w-3" />
                              <span>Voir la conversation</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
