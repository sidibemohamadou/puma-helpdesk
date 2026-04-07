import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatRelativeTime } from "@/lib/utils";
import { 
  useGetDashboardStats,
  useGetRecentActivity,
  useGetTechnicianPerformance,
  useGetTicketsByCategory,
  useGetTicketsByPriority,
  getGetDashboardStatsQueryKey,
  getGetRecentActivityQueryKey,
  getGetTechnicianPerformanceQueryKey,
  getGetTicketsByCategoryQueryKey,
  getGetTicketsByPriorityQueryKey
} from "@workspace/api-client-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Ticket, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Activity,
  Users,
  ChevronRight,
  TrendingUp,
  History
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { Button } from "@/components/ui/button";
import { CategoryIcon, getCategoryLabel } from "@/components/ui/category-icon";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

// Mock data for charts if API fails or returns empty
const MOCK_CATEGORY_DATA = [
  { category: 'hardware', count: 45 },
  { category: 'software', count: 30 },
  { category: 'network', count: 25 },
  { category: 'security', count: 15 },
  { category: 'other', count: 10 },
];

const MOCK_PRIORITY_DATA = [
  { priority: 'critical', count: 5 },
  { priority: 'high', count: 20 },
  { priority: 'medium', count: 50 },
  { priority: 'low', count: 25 },
];

const PRIORITY_COLORS = {
  critical: 'hsl(var(--destructive))',
  high: 'hsl(var(--chart-4))',
  medium: 'hsl(var(--primary))',
  low: 'hsl(var(--muted-foreground))',
};

export default function Dashboard() {
  const { data: stats, isLoading: isStatsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: isActivityLoading } = useGetRecentActivity({ limit: 5 });
  const { data: performance, isLoading: isPerformanceLoading } = useGetTechnicianPerformance();
  const { data: categories, isLoading: isCategoriesLoading } = useGetTicketsByCategory();
  const { data: priorities, isLoading: isPrioritiesLoading } = useGetTicketsByPriority();

  const isLoading = isStatsLoading || isActivityLoading || isPerformanceLoading || isCategoriesLoading || isPrioritiesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="h-4 w-24 bg-muted rounded"></div>
                <div className="h-4 w-4 bg-muted rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded mb-2"></div>
                <div className="h-3 w-32 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const categoryChartData = (categories && categories.length > 0 ? categories : MOCK_CATEGORY_DATA).map(item => ({
    name: getCategoryLabel(item.category as any),
    count: item.count,
    originalCategory: item.category
  }));

  const priorityChartData = (priorities && priorities.length > 0 ? priorities : MOCK_PRIORITY_DATA).map(item => ({
    name: item.priority.charAt(0).toUpperCase() + item.priority.slice(1),
    value: item.count,
    color: PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium
  }));

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">IT Command Center</h1>
          <p className="text-muted-foreground mt-1">Real-time overview of PUMA IT operations and ticketing system.</p>
        </div>
        <Link href="/tickets/new">
          <Button className="shadow-sm hover-elevate">
            <Ticket className="mr-2 h-4 w-4" />
            New Ticket
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-border shadow-sm hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Tickets</CardTitle>
            <div className="p-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-md">
              <Ticket className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats?.openTickets || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Requires attention
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical Priority</CardTitle>
            <div className="p-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-md">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats?.criticalTickets || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Highest urgency incidents
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Resolution Time</CardTitle>
            <div className="p-2 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-md">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {stats?.avgResolutionTimeHours != null ? `${Number(stats.avgResolutionTimeHours).toFixed(1)}h` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across resolved tickets
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolved Today</CardTitle>
            <div className="p-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-md">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats?.resolvedTickets || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Successfully closed
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7 lg:grid-cols-7">
        {/* Charts Section */}
        <Card className="col-span-1 md:col-span-4 shadow-sm border-border">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Tickets by Category
            </CardTitle>
            <CardDescription>Distribution of active incidents across domains</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={50}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Priority Pie Chart */}
        <Card className="col-span-1 md:col-span-3 shadow-sm border-border">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Ticket Priority
            </CardTitle>
            <CardDescription>Current breakdown by urgency level</CardDescription>
          </CardHeader>
          <CardContent className="pt-2 pb-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {priorityChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36}
                    iconType="circle"
                    formatter={(value) => <span className="text-foreground text-sm font-medium">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity Feed */}
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest actions on tickets</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-border">
              {activity && activity.length > 0 ? (
                activity.map((item) => (
                  <div key={item.id} className="flex gap-4 p-4 hover:bg-muted/30 transition-colors">
                    <div className="mt-0.5">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground border">
                        <History className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        <span className="font-semibold">{item.actorName}</span> {item.action}
                      </p>
                      <Link href={`/tickets/${item.ticketId}`}>
                        <p className="text-sm text-primary hover:underline truncate mt-0.5 cursor-pointer">
                          {item.ticketTitle}
                        </p>
                      </Link>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No recent activity found.
                </div>
              )}
            </div>
            {activity && activity.length > 0 && (
              <div className="p-3 border-t bg-muted/20 text-center">
                <Link href="/tickets">
                  <Button variant="link" size="sm" className="text-primary h-auto p-0">
                    View all tickets <ChevronRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Technician Performance */}
        <Card className="shadow-sm border-border flex flex-col">
          <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Technician Performance
              </CardTitle>
              <CardDescription>Resolution metrics by team member</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            <div className="divide-y border-border">
              {performance && performance.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Technician</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Assigned</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Resolved</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-border">
                    {performance.map((tech) => (
                      <tr key={tech.technicianId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {getInitials(tech.technicianName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-foreground">{tech.technicianName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {tech.assignedTickets}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold dark:bg-green-900/30 dark:text-green-400">
                            {tech.resolvedTickets}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {tech.avgResolutionTimeHours != null ? `${Number(tech.avgResolutionTimeHours).toFixed(1)}h` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No performance data available.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
