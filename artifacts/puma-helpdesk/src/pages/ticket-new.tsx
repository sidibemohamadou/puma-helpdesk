import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useCreateTicket, 
  useListUsers,
  getListTicketsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Ticket, AlertCircle } from "lucide-react";
import { Link } from "wouter";

const createTicketSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100, "Title is too long"),
  description: z.string().min(10, "Please provide more details").max(2000, "Description is too long"),
  category: z.enum(["hardware", "software", "network", "security", "other"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  assigneeId: z.coerce.number().optional().nullable(),
});

type CreateTicketValues = z.infer<typeof createTicketSchema>;

export default function TicketNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // Only fetch technicians/admins for assignment
  const { data: usersData } = useListUsers(
    { role: "technician" }, 
    { query: { enabled: user?.role === "admin" || user?.role === "technician" } }
  );

  const form = useForm<CreateTicketValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "hardware",
      priority: "medium",
      assigneeId: null,
    },
  });

  const createTicketMutation = useCreateTicket();

  const onSubmit = (data: CreateTicketValues) => {
    // Clean up empty optional fields
    const payload = { ...data };
    if (!payload.assigneeId) {
      delete payload.assigneeId;
    }

    createTicketMutation.mutate(
      { data: payload },
      {
        onSuccess: (newTicket) => {
          toast({
            title: "Ticket Created",
            description: `Ticket #${newTicket.id} has been created successfully.`,
          });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          setLocation(`/tickets/${newTicket.id}`);
        },
        onError: (error) => {
          toast({
            title: "Failed to create ticket",
            description: error.error?.message || "An unexpected error occurred",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Link href="/tickets">
          <Button variant="outline" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Submit Incident</h1>
          <p className="text-muted-foreground mt-1">Report a new IT issue or request service.</p>
        </div>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-muted/20 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5 text-primary" />
            Ticket Details
          </CardTitle>
          <CardDescription>
            Provide clear and detailed information to help us resolve the issue quickly.
          </CardDescription>
        </CardHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6 pt-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Summary / Title <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Cannot access shared network drive" {...field} />
                    </FormControl>
                    <FormDescription>A brief summary of the issue.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hardware">Hardware</SelectItem>
                          <SelectItem value="software">Software</SelectItem>
                          <SelectItem value="network">Network</SelectItem>
                          <SelectItem value="security">Security</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low - Minor issue, workarounds exist</SelectItem>
                          <SelectItem value="medium">Medium - Standard issue affecting work</SelectItem>
                          <SelectItem value="high">High - Blocking issue for a team</SelectItem>
                          <SelectItem value="critical">Critical - System wide outage</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the issue in detail, including steps to reproduce, error messages, and when it started." 
                        className="min-h-[150px] resize-y"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(user?.role === "admin" || user?.role === "technician") && (
                <FormField
                  control={form.control}
                  name="assigneeId"
                  render={({ field }) => (
                    <FormItem className="border-t pt-6 mt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Staff Assignment (Optional)</span>
                      </div>
                      <FormLabel>Assign To</FormLabel>
                      <Select 
                        onValueChange={(val) => field.onChange(val === "unassigned" ? null : parseInt(val))} 
                        value={field.value ? field.value.toString() : "unassigned"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select technician" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">Leave Unassigned</SelectItem>
                          {usersData?.users.map(u => (
                            <SelectItem key={u.id} value={u.id.toString()}>
                              {u.name} ({u.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Assign immediately to a specific technician.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
            
            <CardFooter className="bg-muted/10 border-t px-6 py-4 flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setLocation("/tickets")}>
                Cancel
              </Button>
              <Button type="submit" className="shadow-sm hover-elevate" disabled={createTicketMutation.isPending}>
                {createTicketMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
