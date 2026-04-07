import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Shield, User as UserIcon, Mail, Building, Calendar, KeyRound } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">View your personal account details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 shadow-sm border-border text-center overflow-hidden">
          <div className="h-24 bg-gradient-to-br from-primary/80 to-primary w-full"></div>
          <CardContent className="pt-0 relative px-6 pb-6">
            <Avatar className="h-24 w-24 border-4 border-card shadow-lg mx-auto -mt-12 bg-card">
              <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <h2 className="mt-4 text-xl font-bold text-foreground">{user.name}</h2>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium capitalize text-primary bg-primary/10 px-3 py-1 rounded-full w-fit mx-auto">
              {user.role === 'admin' && <Shield className="h-3.5 w-3.5" />}
              {user.role}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm border-border">
          <CardHeader className="bg-muted/10 border-b pb-4">
            <CardTitle className="text-lg">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <UserIcon className="h-4 w-4" /> Full Name
                </span>
                <p className="font-semibold text-foreground">{user.name}</p>
              </div>
              
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email Address
                </span>
                <p className="font-semibold text-foreground">{user.email}</p>
              </div>
              
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Building className="h-4 w-4" /> Department
                </span>
                <p className="font-semibold text-foreground">{user.department || "Not specified"}</p>
              </div>
              
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Joined Date
                </span>
                <p className="font-semibold text-foreground">{formatDate(user.createdAt)}</p>
              </div>
            </div>

            <Separator />

            <div className="flex justify-between items-center bg-muted/20 p-4 rounded-lg border">
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  Password & Security
                </h4>
                <p className="text-sm text-muted-foreground mt-1">Manage your credentials</p>
              </div>
              <Button variant="outline" disabled title="Feature coming soon">Change Password</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
