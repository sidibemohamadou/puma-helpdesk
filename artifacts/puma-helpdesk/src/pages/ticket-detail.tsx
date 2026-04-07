import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useGetTicket, 
  useUpdateTicket, 
  useDeleteTicket,
  useCreateComment,
  useListUsers,
  getGetTicketQueryKey,
  getListTicketsQueryKey
} from "@workspace/api-client-react";
import type { User as UserType } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { formatDate, formatRelativeTime, getInitials } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormMessage 
} from "@/components/ui/form";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { CategoryIcon, getCategoryLabel } from "@/components/ui/category-icon";
import { 
  ArrowLeft, 
  Clock, 
  Send, 
  Trash2, 
  ShieldAlert, 
  User, 
  MessageSquare,
  Lock,
  Calendar
} from "lucide-react";

const commentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty"),
  isInternal: z.boolean().default(false),
});

export default function TicketDetail() {
  const [, params] = useRoute("/tickets/:id");
  const ticketId = params?.id ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const canManage = user?.role === "admin" || user?.role === "technician";
  
  const { data: ticket, isLoading, isError } = useGetTicket(ticketId, {
    query: { enabled: !!ticketId }
  });

  const { data: usersData } = useListUsers(
    { role: "technician" }, 
    { query: { enabled: canManage } }
  );

  const [workload, setWorkload] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!canManage) return;
    fetch("/api/users/workload", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { id: number; openTickets: number }[]) => {
        const map: Record<number, number> = {};
        data.forEach((t) => { map[t.id] = t.openTickets; });
        setWorkload(map);
      })
      .catch(() => {});
  }, [canManage]);

  const updateTicketMutation = useUpdateTicket();
  const deleteTicketMutation = useDeleteTicket();
  const createCommentMutation = useCreateComment();

  const commentForm = useForm<z.infer<typeof commentSchema>>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: "",
      isInternal: false,
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground space-y-4">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p>Chargement du ticket…</p>
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="p-12 text-center text-destructive">
        Impossible de charger le ticket ou ticket introuvable.
      </div>
    );
  }

  const handleStatusChange = (newStatus: any) => {
    updateTicketMutation.mutate(
      { id: ticketId, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          toast({ title: "Statut mis à jour" });
        },
        onError: () => toast({ title: "Impossible de mettre à jour le statut", variant: "destructive" })
      }
    );
  };

  const handleAssigneeChange = (assigneeIdString: string) => {
    const assigneeId = assigneeIdString === "unassigned" ? null : parseInt(assigneeIdString);
    updateTicketMutation.mutate(
      { id: ticketId, data: { assigneeId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          toast({ title: "Technicien assigné" });
        },
        onError: () => toast({ title: "Impossible d'assigner le technicien", variant: "destructive" })
      }
    );
  };

  const handleDelete = () => {
    deleteTicketMutation.mutate(
      { id: ticketId },
      {
        onSuccess: () => {
          toast({ title: "Ticket supprimé avec succès" });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          setLocation("/tickets");
        },
        onError: () => toast({ title: "Impossible de supprimer le ticket", variant: "destructive" })
      }
    );
  };

  const onCommentSubmit = (data: z.infer<typeof commentSchema>) => {
    createCommentMutation.mutate(
      { 
        id: ticketId, 
        data: { 
          content: data.content, 
          isInternal: data.isInternal 
        } 
      } as any, // TypeScript workaround for generated hook params structure
      {
        onSuccess: () => {
          commentForm.reset();
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
        },
        onError: () => toast({ title: "Impossible de poster le commentaire", variant: "destructive" })
      }
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/tickets">
            <Button variant="outline" size="icon" className="shrink-0 h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground truncate max-w-[400px] md:max-w-xl">
                {ticket.title}
              </h1>
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <span>#{ticket.id.toString().padStart(4, '0')}</span>
              <span>•</span>
              <span>Created {formatRelativeTime(ticket.createdAt)}</span>
              {ticket.resolvedAt && (
                <>
                  <span>•</span>
                  <span className="text-green-600 dark:text-green-400 font-medium flex items-center">
                    Resolved {formatRelativeTime(ticket.resolvedAt)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <PriorityBadge priority={ticket.priority} className="px-3 py-1 text-sm" />
          <StatusBadge status={ticket.status} className="px-3 py-1 text-sm" />
          
          {user?.role === "admin" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive hover:text-destructive-foreground ml-2">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the ticket
                    and all associated comments.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-3 border-b bg-muted/10">
              <CardTitle className="text-lg">Description</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-foreground">
                {ticket.description}
              </div>
            </CardContent>
          </Card>

          {/* Chat Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversation
              {ticket.assignee && (
                <span className="ml-auto text-xs font-normal text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Pris en charge par {ticket.assignee.name}
                </span>
              )}
            </h3>

            {/* Chat Bubbles */}
            <div className="space-y-3 min-h-[80px]">
              {ticket.comments
                ?.filter((c) => !c.isInternal || canManage)
                .map((comment) => {
                  const isMe = comment.author.id === user?.id;
                  const isTechStaff =
                    comment.author.role === "admin" || comment.author.role === "technician";

                  return (
                    <div
                      key={comment.id}
                      className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <Avatar className="h-8 w-8 border shadow-sm shrink-0 mt-1">
                        <AvatarFallback
                          className={
                            isTechStaff
                              ? "bg-primary/10 text-primary text-xs"
                              : "bg-secondary text-secondary-foreground text-xs"
                          }
                        >
                          {getInitials(comment.author.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className={`flex flex-col gap-1 max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!isMe && (
                            <span className="text-xs font-semibold text-foreground">{comment.author.name}</span>
                          )}
                          {isTechStaff && !isMe && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium capitalize">
                              {comment.author.role}
                            </span>
                          )}
                          {comment.isInternal && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium flex items-center gap-0.5">
                              <Lock className="h-2.5 w-2.5" /> Note interne
                            </span>
                          )}
                        </div>

                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${
                            comment.isInternal
                              ? "bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/40 text-foreground rounded-tl-sm"
                              : isMe
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-card border border-border text-foreground rounded-tl-sm"
                          }`}
                        >
                          {comment.content}
                        </div>

                        <span
                          className="text-[10px] text-muted-foreground"
                          title={formatDate(comment.createdAt)}
                        >
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {(!ticket.comments || ticket.comments.filter((c) => !c.isInternal || canManage).length === 0) && (
                <div className="text-center py-10 text-muted-foreground border border-dashed rounded-xl bg-muted/10 text-sm">
                  Aucun message. Commencez la conversation ci-dessous.
                </div>
              )}
            </div>

            {/* Message Input */}
            <Card className="shadow-sm border-border mt-4 overflow-hidden focus-within:ring-1 focus-within:ring-ring transition-shadow">
              <Form {...commentForm}>
                <form onSubmit={commentForm.handleSubmit(onCommentSubmit)}>
                  <div className="p-4 pb-0">
                    <FormField
                      control={commentForm.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              placeholder={canManage ? "Répondre à l'agent..." : "Envoyer un message au technicien..."}
                              className="min-h-[80px] border-none shadow-none focus-visible:ring-0 resize-none p-0"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="bg-muted/30 p-3 border-t flex items-center justify-between">
                    <div>
                      {canManage && (
                        <FormField
                          control={commentForm.control}
                          name="isInternal"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <Label className="text-sm font-normal text-muted-foreground cursor-pointer flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                Note interne (cachée aux agents)
                              </Label>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      className="shadow-sm"
                      disabled={createCommentMutation.isPending || !commentForm.watch("content").trim()}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {createCommentMutation.isPending ? "Envoi..." : "Envoyer"}
                    </Button>
                  </div>
                </form>
              </Form>
            </Card>
          </div>
        </div>

        {/* Right Column: Meta Info & Controls */}
        <div className="space-y-6">
          {/* Controls (Tech/Admin) */}
          {canManage && (
            <Card className="shadow-sm border-border border-l-4 border-l-primary overflow-hidden">
              <CardHeader className="pb-3 bg-muted/10 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Management Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Statut</Label>
                  <Select value={ticket.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-full bg-background font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Ouvert</SelectItem>
                      <SelectItem value="in_progress">En cours</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="resolved">Résolu</SelectItem>
                      <SelectItem value="closed">Fermé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Technicien assigné</Label>
                  <Select 
                    value={ticket.assigneeId ? ticket.assigneeId.toString() : "unassigned"} 
                    onValueChange={handleAssigneeChange}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Non assigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-muted-foreground italic">Non assigné</SelectItem>
                      {(usersData as UserType[] | undefined)?.map(u => {
                        const openCount = workload[u.id] ?? 0;
                        return (
                          <SelectItem key={u.id} value={u.id.toString()}>
                            <span className="flex items-center justify-between gap-3 w-full">
                              <span>{u.name}</span>
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${openCount === 0 ? "bg-green-100 text-green-700" : openCount < 5 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                {openCount} ticket{openCount !== 1 ? "s" : ""}
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Properties */}
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-3 bg-muted/10 border-b">
              <CardTitle className="text-base">Propriétés</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <dl className="divide-y text-sm">
                <div className="flex justify-between p-4">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <CategoryIcon category={ticket.category} className="h-4 w-4" />
                    Catégorie
                  </dt>
                  <dd className="font-medium text-foreground">{getCategoryLabel(ticket.category)}</dd>
                </div>
                <div className="flex justify-between p-4">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Demandeur
                  </dt>
                  <dd className="font-medium text-foreground text-right">
                    <div>{ticket.createdBy.name}</div>
                    <div className="text-xs text-muted-foreground">{ticket.createdBy.department || 'Aucun département'}</div>
                  </dd>
                </div>
                <div className="flex justify-between p-4">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Technicien
                  </dt>
                  <dd className="font-medium text-foreground text-right">
                    {ticket.assignee ? ticket.assignee.name : <span className="text-muted-foreground italic">Non assigné</span>}
                  </dd>
                </div>
                <div className="flex flex-col gap-2 p-4 bg-muted/5">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Chronologie
                  </dt>
                  <dd className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Créé :</span>
                      <span className="font-medium text-foreground">{formatDate(ticket.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mis à jour :</span>
                      <span className="font-medium text-foreground">{formatDate(ticket.updatedAt)}</span>
                    </div>
                    {ticket.resolvedAt && (
                      <div className="flex justify-between">
                        <span className="text-green-600 dark:text-green-400">Résolu :</span>
                        <span className="font-medium text-green-600 dark:text-green-400">{formatDate(ticket.resolvedAt)}</span>
                      </div>
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
