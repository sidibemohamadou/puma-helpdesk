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
  title: z.string().min(5, "Le titre doit comporter au moins 5 caractères").max(100, "Le titre est trop long"),
  description: z.string().min(10, "Veuillez fournir plus de détails").max(2000, "La description est trop longue"),
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
    const payload = { ...data };
    if (!payload.assigneeId) {
      delete payload.assigneeId;
    }

    createTicketMutation.mutate(
      { data: payload },
      {
        onSuccess: (newTicket) => {
          toast({
            title: "Ticket créé",
            description: `Le ticket #${newTicket.id} a été créé avec succès.`,
          });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          setLocation(`/tickets/${newTicket.id}`);
        },
        onError: (error) => {
          toast({
            title: "Échec de la création du ticket",
            description: error.error?.message || "Une erreur inattendue est survenue",
            variant: "destructive",
          });
        },
      }
    );
  };

  const technicians = Array.isArray(usersData) ? usersData : (usersData as any)?.users ?? [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Link href="/tickets">
          <Button variant="outline" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Soumettre un incident</h1>
          <p className="text-muted-foreground mt-1">Signalez un nouveau problème informatique ou demandez un service.</p>
        </div>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-muted/20 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5 text-primary" />
            Détails du ticket
          </CardTitle>
          <CardDescription>
            Fournissez des informations claires et détaillées pour nous aider à résoudre le problème rapidement.
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
                    <FormLabel>Résumé / Titre <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Ex : Impossible d'accéder au lecteur réseau partagé" {...field} />
                    </FormControl>
                    <FormDescription>Un résumé concis du problème.</FormDescription>
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
                      <FormLabel>Catégorie <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une catégorie" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hardware">Matériel</SelectItem>
                          <SelectItem value="software">Logiciel</SelectItem>
                          <SelectItem value="network">Réseau</SelectItem>
                          <SelectItem value="security">Sécurité</SelectItem>
                          <SelectItem value="other">Autre</SelectItem>
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
                      <FormLabel>Priorité <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir la priorité" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Faible — Problème mineur, contournements possibles</SelectItem>
                          <SelectItem value="medium">Moyenne — Problème standard impactant le travail</SelectItem>
                          <SelectItem value="high">Haute — Problème bloquant pour une équipe</SelectItem>
                          <SelectItem value="critical">Critique — Panne généralisée du système</SelectItem>
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
                        placeholder="Décrivez le problème en détail : étapes pour reproduire, messages d'erreur, depuis quand cela se produit..." 
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
                        <span className="text-sm font-medium">Assignation (optionnel)</span>
                      </div>
                      <FormLabel>Assigner à</FormLabel>
                      <Select 
                        onValueChange={(val) => field.onChange(val === "unassigned" ? null : parseInt(val))} 
                        value={field.value ? field.value.toString() : "unassigned"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner un technicien" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">Laisser non assigné</SelectItem>
                          {technicians.map((u: any) => (
                            <SelectItem key={u.id} value={u.id.toString()}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Assignez immédiatement à un technicien spécifique.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
            
            <CardFooter className="bg-muted/10 border-t px-6 py-4 flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setLocation("/tickets")}>
                Annuler
              </Button>
              <Button type="submit" className="shadow-sm hover-elevate" disabled={createTicketMutation.isPending}>
                {createTicketMutation.isPending ? "Envoi en cours..." : "Soumettre le ticket"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
