import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
        <SearchX className="h-12 w-12 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">404</h1>
      <h2 className="text-2xl font-semibold text-muted-foreground mb-6">Page introuvable</h2>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        La page que vous recherchez n'existe pas ou a été déplacée.
        Vérifiez l'URL ou retournez au tableau de bord.
      </p>
      <Link href="/">
        <Button size="lg" className="shadow-sm hover-elevate">
          Retour au tableau de bord
        </Button>
      </Link>
    </div>
  );
}
