import { useState } from "react";
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
        <p>Loading ticket details...</p>
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="p-12 text-center text-destructive">
        Failed to load ticket or ticket not found.
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
          toast({ title: "Status updated" });
        },
        onError: () => toast({ title: "Failed to update status", variant: "destructive" })
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
          toast({ title: "Assignee updated" });
        },
        onError: () => toast({ title: "Failed to update assignee", variant: "destructive" })
      }
    );
  };

  const handleDelete = () => {
    deleteTicketMutation.mutate(
      { id: ticketId },
      {
        onSuccess: () => {
          toast({ title: "Ticket deleted successfully" });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          setLocation("/tickets");
        },
        onError: () => toast({ title: "Failed to delete ticket", variant: "destructive" })
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
        onError: () => toast({ title: "Failed to post comment", variant: "destructive" })
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

          {/* Comments Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversation
            </h3>
            
            <div className="space-y-4">
              {ticket.comments?.map((comment) => (
                <div 
                  key={comment.id} 
                  className={`flex gap-4 p-4 rounded-lg border shadow-sm ${
                    comment.isInternal 
                      ? "bg-amber-50/50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/50" 
                      : "bg-card border-border"
                  }`}
                >
                  <Avatar className="h-10 w-10 border shadow-sm shrink-0">
                    <AvatarFallback className={
                      comment.author.role === 'admin' || comment.author.role === 'technician' 
                        ? "bg-primary/10 text-primary" 
                        : "bg-secondary text-secondary-foreground"
                    }>
                      {getInitials(comment.author.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{comment.author.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                          {comment.author.role}
                        </span>
                        {comment.isInternal && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400 font-medium flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Internal Note
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap" title={formatDate(comment.createdAt)}>
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-wrap mt-2">
                      {comment.content}
                    </div>
                  </div>
                </div>
              ))}
              
              {(!ticket.comments || ticket.comments.length === 0) && (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                  No comments yet. Start the conversation below.
                </div>
              )}
            </div>

            {/* Comment Form */}
            <Card className="shadow-sm border-border mt-6 overflow-hidden focus-within:ring-1 focus-within:ring-ring transition-shadow">
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
                              placeholder="Add a reply..." 
                              className="min-h-[100px] border-none shadow-none focus-visible:ring-0 resize-none p-0"
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
                                Internal note (hidden from agents)
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
                      {createCommentMutation.isPending ? "Sending..." : "Send Reply"}
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
                  <Label>Status</Label>
                  <Select value={ticket.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-full bg-background font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Select 
                    value={ticket.assigneeId ? ticket.assigneeId.toString() : "unassigned"} 
                    onValueChange={handleAssigneeChange}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-muted-foreground italic">Unassigned</SelectItem>
                      {usersData?.users.map(u => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Properties */}
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-3 bg-muted/10 border-b">
              <CardTitle className="text-base">Properties</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <dl className="divide-y text-sm">
                <div className="flex justify-between p-4">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <CategoryIcon category={ticket.category} className="h-4 w-4" />
                    Category
                  </dt>
                  <dd className="font-medium text-foreground">{getCategoryLabel(ticket.category)}</dd>
                </div>
                <div className="flex justify-between p-4">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Requester
                  </dt>
                  <dd className="font-medium text-foreground text-right">
                    <div>{ticket.createdBy.name}</div>
                    <div className="text-xs text-muted-foreground">{ticket.createdBy.department || 'No department'}</div>
                  </dd>
                </div>
                <div className="flex justify-between p-4">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Assignee
                  </dt>
                  <dd className="font-medium text-foreground text-right">
                    {ticket.assignee ? ticket.assignee.name : <span className="text-muted-foreground italic">Unassigned</span>}
                  </dd>
                </div>
                <div className="flex flex-col gap-2 p-4 bg-muted/5">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Timeline
                  </dt>
                  <dd className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span className="font-medium text-foreground">{formatDate(ticket.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Updated:</span>
                      <span className="font-medium text-foreground">{formatDate(ticket.updatedAt)}</span>
                    </div>
                    {ticket.resolvedAt && (
                      <div className="flex justify-between">
                        <span className="text-green-600 dark:text-green-400">Resolved:</span>
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
