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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useLogin();

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/");
        },
        onError: (error) => {
          toast({
            title: "Authentication Failed",
            description: error.error?.message || "Invalid email or password",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col md:flex-row bg-muted/30">
      <div className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />
        
        <div className="w-full max-w-md z-10">
          <div className="flex items-center gap-3 mb-10 justify-center">
            <div className="w-12 h-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xl font-black shadow-lg">
              PU
            </div>
            <span className="font-bold text-3xl text-foreground tracking-tight">PUMA IT</span>
          </div>

          <Card className="border-border shadow-xl">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold text-center">System Access</CardTitle>
              <CardDescription className="text-center text-muted-foreground">
                Enter your credentials to access the IT Helpdesk
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <Label htmlFor="email">Email</Label>
                        <FormControl>
                          <Input 
                            id="email" 
                            placeholder="agent@puma.gov" 
                            autoComplete="email"
                            className="bg-background"
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
                        <div className="flex justify-between items-center">
                          <Label htmlFor="password">Password</Label>
                        </div>
                        <FormControl>
                          <Input 
                            id="password" 
                            type="password" 
                            autoComplete="current-password"
                            className="bg-background"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {loginMutation.isError && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{loginMutation.error?.error?.message || "Invalid credentials"}</span>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full font-semibold shadow-sm hover-elevate"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Authenticating..." : "Sign In"}
                  </Button>
                </form>
              </Form>
              
              <div className="mt-6 text-center text-xs text-muted-foreground border-t pt-6">
                <p>Programme d'Urgence de Modernisation des Axes et Territoires frontaliers</p>
                <p className="mt-1">IT Operations & Support Center</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Right side banner for desktop */}
      <div className="hidden lg:flex flex-1 bg-primary relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-orange-600 mix-blend-multiply opacity-80" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xNSkiLz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative z-10 mt-auto">
          <h2 className="text-4xl font-bold text-white mb-4">Enterprise Support Hub</h2>
          <p className="text-primary-foreground/80 text-lg max-w-md leading-relaxed">
            Centralized incident management, rapid resolution tracking, and technical support coordination for all PUMA staff and facilities.
          </p>
          
          <div className="mt-12 flex gap-6 text-primary-foreground/70">
            <div className="flex flex-col">
              <span className="font-bold text-2xl text-white">99.9%</span>
              <span className="text-sm">Uptime SLA</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-2xl text-white">24/7</span>
              <span className="text-sm">Monitoring</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
