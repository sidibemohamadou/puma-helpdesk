import { Badge } from "@/components/ui/badge";
import { type TicketPriority } from "@workspace/api-client-react/src/generated/api.schemas";
import { AlertCircle, AlertTriangle, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

interface PriorityBadgeProps {
  priority: TicketPriority;
  className?: string;
  showIcon?: boolean;
}

export function PriorityBadge({ priority, className, showIcon = true }: PriorityBadgeProps) {
  const config: Record<TicketPriority, { label: string; className: string; icon: React.ElementType }> = {
    low: {
      label: "Low",
      className: "text-slate-500 bg-slate-100/50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-700",
      icon: ArrowDownCircle,
    },
    medium: {
      label: "Medium",
      className: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800",
      icon: ArrowUpCircle,
    },
    high: {
      label: "High",
      className: "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-800",
      icon: AlertTriangle,
    },
    critical: {
      label: "Critical",
      className: "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800",
      icon: AlertCircle,
    },
  };

  const { label, className: badgeClass, icon: Icon } = config[priority];

  return (
    <Badge variant="outline" className={`${badgeClass} font-medium ${className || ""}`}>
      {showIcon && <Icon className="h-3 w-3 mr-1" />}
      {label}
    </Badge>
  );
}
