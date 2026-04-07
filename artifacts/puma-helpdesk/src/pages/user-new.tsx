import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useCreateUser,
  getListUsersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, UserPlus } from "lucide-react";

const createUserSchema = z.object({
  name: z.string().min(2, "Le nom doit comporter au moins 2 caractères").max(100),
  email: z.string().email("Veuillez saisir une adresse email valide"),
  password: z.string().min(6, "Le mot de passe doit comporter au moins 6 caractères"),
  role: z.enum(["agent", "technician", "admin"]),
  department: z.string().optional(),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

export default function UserNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "agent",
      department: "",
    },
  });

  const createUserMutation = useCreateUser();

  const onSubmit = (data: CreateUserValues) => {
    createUserMutation.mutate(
      { data },
      {
        onSuccess: () => {
          toast({
            title: "Utilisateur créé",
            description: `${data.name} a été ajouté au système.`,
          });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setLocation("/users");
        },
        onError: (error) => {
          toast({
            title: "Échec de la création",
            description: error.error?.message || "Une erreur inattendue est survenue",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Link href="/users">
          <Button variant="outline" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Ajouter du personnel</h1>
          <p className="text-muted-foreground mt-1">Créez un nouveau compte utilisateur pour le PUMA Helpdesk.</p>
        </div>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-muted/20 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-primary" />
            Informations du compte
          </CardTitle>
          <CardDescription>
            L'utilisateur pourra se connecter immédiatement avec le mot de passe fourni.
          </CardDescription>
        </CardHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom complet <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Prénom Nom" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adresse email <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="prenom.nom@puma.sn" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mot de passe temporaire <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="Générer un mot de passe sécurisé..." {...field} />
                      </FormControl>
                      <FormDescription>Communiquez ce mot de passe à l'utilisateur de façon sécurisée.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rôle système <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un rôle" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="agent">Agent (Soumettre et suivre les tickets)</SelectItem>
                          <SelectItem value="technician">Technicien (Résoudre et commenter)</SelectItem>
                          <SelectItem value="admin">Administrateur (Accès complet)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Département</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex : Finances, RH, Informatique" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            
            <CardFooter className="bg-muted/10 border-t px-6 py-4 flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setLocation("/users")}>
                Annuler
              </Button>
              <Button type="submit" className="shadow-sm hover-elevate" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Création en cours..." : "Créer le compte"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
