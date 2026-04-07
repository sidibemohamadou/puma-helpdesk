import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListUsers, 
  useUpdateUser, 
  useDeleteUser,
  getListUsersQueryKey
} from "@workspace/api-client-react";
import { formatDate, getInitials } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Shield, UserCog, User as UserIcon } from "lucide-react";
import type { User } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Users() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [userToDelete, setUserToDelete] = useState<number | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const { data, isLoading } = useListUsers({
    search: debouncedSearch || undefined,
  });

  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  const handleRoleChange = (userId: number, newRole: "agent" | "technician" | "admin") => {
    updateUserMutation.mutate(
      { id: userId, data: { role: newRole } },
      {
        onSuccess: () => {
          toast({ title: "Role updated successfully" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err) => {
          toast({ 
            title: "Failed to update role", 
            description: err.error?.message,
            variant: "destructive" 
          });
        }
      }
    );
  };

  const handleDelete = () => {
    if (!userToDelete) return;
    
    deleteUserMutation.mutate(
      { id: userToDelete },
      {
        onSuccess: () => {
          toast({ title: "User deleted successfully" });
          setUserToDelete(null);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err) => {
          toast({ 
            title: "Failed to delete user", 
            description: err.error?.message,
            variant: "destructive" 
          });
          setUserToDelete(null);
        }
      }
    );
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin": return <Shield className="h-3 w-3 text-red-500" />;
      case "technician": return <UserCog className="h-3 w-3 text-blue-500" />;
      default: return <UserIcon className="h-3 w-3 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Staff Directory</h1>
          <p className="text-muted-foreground mt-1">Manage system access, roles, and personnel.</p>
        </div>
        <Link href="/users/new">
          <Button className="shadow-sm hover-elevate">
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </Link>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="pb-4 border-b bg-muted/20">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name, email, or department..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setTimeout(() => setDebouncedSearch(e.target.value), 300);
              }}
              className="pl-9 bg-background w-full"
            />
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground space-y-4">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p>Loading users...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data as User[] | undefined)?.map((u: User) => (
                    <TableRow key={u.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border shadow-sm">
                            <AvatarFallback className={
                              u.role === 'admin' 
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                                : u.role === 'technician' 
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                            }>
                              {getInitials(u.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 border w-fit px-2.5 py-1 rounded-md bg-background text-sm font-medium capitalize">
                          {getRoleIcon(u.role)}
                          {u.role}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.department || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px]">
                            <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleRoleChange(u.id, "agent")}
                              disabled={u.role === "agent" || updateUserMutation.isPending}
                            >
                              <UserIcon className="mr-2 h-4 w-4" />
                              Agent
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleRoleChange(u.id, "technician")}
                              disabled={u.role === "technician" || updateUserMutation.isPending}
                            >
                              <UserCog className="mr-2 h-4 w-4" />
                              Technician
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleRoleChange(u.id, "admin")}
                              disabled={u.role === "admin" || updateUserMutation.isPending}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Admin
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setUserToDelete(u.id)}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={userToDelete !== null} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user account
              and reassign their tickets to unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
