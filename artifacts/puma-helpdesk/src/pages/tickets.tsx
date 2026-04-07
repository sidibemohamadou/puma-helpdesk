import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListTickets, 
  getListTicketsQueryKey,
  useListUsers
} from "@workspace/api-client-react";
import type { 
  ListTicketsStatus, 
  ListTicketsPriority, 
  ListTicketsCategory 
} from "@workspace/api-client-react/src/generated/api.schemas";
import { formatDate, formatRelativeTime, getInitials } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { CategoryIcon, getCategoryLabel } from "@/components/ui/category-icon";
import { 
  Search, 
  Filter, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock,
  Ticket as TicketIcon
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce"; // We need to create this or just do simple state

export default function Tickets() {
  const [search, setSearch] = useState("");
  // Simple debounce logic inline for now, but we can just use the state directly and rely on API speed
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const [status, setStatus] = useState<ListTicketsStatus | "all">("all");
  const [priority, setPriority] = useState<ListTicketsPriority | "all">("all");
  const [category, setCategory] = useState<ListTicketsCategory | "all">("all");
  const [page, setPage] = useState(1);
  const limit = 10;

  // Handle search debounce
  useState(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  });

  const { data, isLoading, isError } = useListTickets({
    search: debouncedSearch || undefined,
    status: status !== "all" ? status : undefined,
    priority: priority !== "all" ? priority : undefined,
    category: category !== "all" ? category : undefined,
    page,
    limit,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    // Simple inline debounce
    setTimeout(() => {
      setDebouncedSearch(e.target.value);
      setPage(1);
    }, 300);
  };

  const handleFilterChange = (setter: any) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
    setPriority("all");
    setCategory("all");
    setPage(1);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Registre des incidents</h1>
          <p className="text-muted-foreground mt-1">Gérez et suivez l'ensemble des incidents et demandes signalés.</p>
        </div>
        <Link href="/tickets/new">
          <Button className="shadow-sm hover-elevate">
            <Plus className="mr-2 h-4 w-4" />
            Créer un ticket
          </Button>
        </Link>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="pb-4 border-b bg-muted/20">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par titre, ID ou description..."
                value={search}
                onChange={handleSearchChange}
                className="pl-9 bg-background w-full"
              />
            </div>
            
            <div className="flex flex-wrap gap-3">
              <Select value={status} onValueChange={handleFilterChange(setStatus)}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="open">Ouvert</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="resolved">Résolu</SelectItem>
                  <SelectItem value="closed">Clôturé</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={priority} onValueChange={handleFilterChange(setPriority)}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les priorités</SelectItem>
                  <SelectItem value="low">Faible</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={category} onValueChange={handleFilterChange(setCategory)}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  <SelectItem value="hardware">Matériel</SelectItem>
                  <SelectItem value="software">Logiciel</SelectItem>
                  <SelectItem value="network">Réseau</SelectItem>
                  <SelectItem value="security">Sécurité</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
              
              {(status !== "all" || priority !== "all" || category !== "all" || search !== "") && (
                <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground space-y-4">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p>Chargement des tickets...</p>
            </div>
          ) : isError ? (
            <div className="p-12 text-center text-destructive">
              Impossible de charger les tickets. Veuillez réessayer.
            </div>
          ) : data?.tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <TicketIcon className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">Aucun ticket trouvé</h3>
              <p className="max-w-sm mb-6">
                Aucun ticket ne correspond à vos filtres actuels.
              </p>
              <Button variant="outline" onClick={resetFilters}>Effacer les filtres</Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[100px]">ID</TableHead>
                      <TableHead>Détails du ticket</TableHead>
                      <TableHead className="w-[140px]">Statut</TableHead>
                      <TableHead className="w-[140px]">Priorité</TableHead>
                      <TableHead className="w-[160px]">Assigné à</TableHead>
                      <TableHead className="w-[140px] text-right">Mis à jour</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.tickets.map((ticket) => (
                      <TableRow key={ticket.id} className="hover:bg-muted/30 cursor-pointer group">
                        <TableCell className="font-medium text-muted-foreground">
                          <Link href={`/tickets/${ticket.id}`} className="block">
                            #{ticket.id.toString().padStart(4, '0')}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/tickets/${ticket.id}`} className="block">
                            <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {ticket.title}
                            </div>
                            <div className="flex items-center text-xs text-muted-foreground mt-1 gap-2">
                              <span className="flex items-center gap-1">
                                <CategoryIcon category={ticket.category} className="h-3 w-3" />
                                {getCategoryLabel(ticket.category)}
                              </span>
                              <span>•</span>
                              <span>Par {ticket.createdBy.name}</span>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/tickets/${ticket.id}`} className="block">
                            <StatusBadge status={ticket.status} />
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/tickets/${ticket.id}`} className="block">
                            <PriorityBadge priority={ticket.priority} />
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/tickets/${ticket.id}`} className="block">
                            {ticket.assignee ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6 border">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                    {getInitials(ticket.assignee.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm truncate max-w-[100px]">{ticket.assignee.name}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">Non assigné</span>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          <Link href={`/tickets/${ticket.id}`} className="block">
                            <div className="flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(ticket.updatedAt)}
                            </div>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
                  <div className="text-sm text-muted-foreground">
                    Affichage <span className="font-medium text-foreground">{(data.page - 1) * data.limit + 1}</span> à <span className="font-medium text-foreground">{Math.min(data.page * data.limit, data.total)}</span> sur <span className="font-medium text-foreground">{data.total}</span> tickets
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Précédent
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                      disabled={page === data.totalPages}
                    >
                      Suivant
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
