import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { ShieldAlert, User, UserCog, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Veuillez saisir un email valide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  {
    role: "Agent",
    email: "agent1@puma.sn",
    password: "agent123",
    icon: User,
    desc: "Soumettre et suivre des tickets",
    color: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
  },
  {
    role: "Technicien",
    email: "tech1@puma.sn",
    password: "tech123",
    icon: UserCog,
    desc: "Gérer et résoudre les incidents",
    color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
  },
  {
    role: "Administrateur",
    email: "admin@puma.sn",
    password: "admin123",
    icon: Shield,
    desc: "Supervision et gestion complète",
    color: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
  },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useLogin();

  const doLogin = (email: string, password: string, demoRole?: string) => {
    if (demoRole) setLoadingDemo(demoRole);
    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/");
        },
        onError: (error) => {
          setLoadingDemo(null);
          toast({
            title: "Échec de la connexion",
            description: error.error?.message || "Email ou mot de passe incorrect",
            variant: "destructive",
          });
        },
      }
    );
  };

  const onSubmit = (data: LoginFormValues) => doLogin(data.email, data.password);

  return (
    <div className="min-h-[100dvh] w-full flex bg-white">
      {/* Left — Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-10">
            <img
              src="/logo-puma.jpg"
              alt="Logo PUMA"
              className="h-20 w-20 object-contain"
            />
            <div className="text-center">
              <h1 className="font-black text-2xl text-foreground tracking-tight">PUMA Helpdesk</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Support Informatique
              </p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-xl font-bold text-foreground mb-1">Connexion</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Accédez à votre espace de support
            </p>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                      <FormControl>
                        <Input
                          id="email"
                          placeholder="prenom.nom@puma.sn"
                          autoComplete="email"
                          className="bg-white"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
                      <FormControl>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          className="bg-white"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {loginMutation.isError && !loadingDemo && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{loginMutation.error?.error?.message || "Identifiants invalides"}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full font-semibold text-sm"
                  disabled={loginMutation.isPending && !loadingDemo}
                >
                  {loginMutation.isPending && !loadingDemo ? "Connexion en cours..." : "Se connecter"}
                </Button>
              </form>
            </Form>
          </div>

          {/* Demo Access Section */}
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium">ACCÈS DÉMO RAPIDE</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((account) => {
                const Icon = account.icon;
                const isLoading = loadingDemo === account.role;
                return (
                  <button
                    key={account.role}
                    onClick={() => doLogin(account.email, account.password, account.role)}
                    disabled={loginMutation.isPending}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${account.color} disabled:opacity-60`}
                  >
                    <div className="shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{account.role}</div>
                      <div className="text-xs opacity-70 truncate">{account.desc}</div>
                    </div>
                    {isLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                      <span className="text-xs opacity-50 font-mono shrink-0">→</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-8 leading-relaxed">
            Programme d'Urgence de Modernisation<br />des Axes et Territoires frontaliers
          </p>
        </div>
      </div>

      {/* Right — Branding panel */}
      <div className="hidden lg:flex w-[420px] shrink-0 flex-col justify-between bg-foreground text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px"}} />

        <div className="relative z-10">
          <img src="/logo-puma.jpg" alt="PUMA" className="h-16 w-16 object-contain rounded-lg" />
        </div>

        <div className="relative z-10">
          <h2 className="text-3xl font-black text-white mb-4 leading-tight">
            Système de<br />Support IT Unifié
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            Gestion centralisée des incidents informatiques, suivi en temps réel et coordination du support technique pour tous les agents PUMA.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: "Disponibilité", value: "99.9%" },
              { label: "Surveillance", value: "24/7" },
              { label: "Rôles", value: "3" },
              { label: "Priorités", value: "4" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/8 rounded-xl p-4">
                <div className="text-xl font-black text-white">{stat.value}</div>
                <div className="text-xs text-white/50 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
