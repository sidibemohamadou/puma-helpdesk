import { Badge } from "@/components/ui/badge";
import { type TicketStatus } from "@workspace/api-client-react/src/generated/api.schemas";

interface StatusBadgeProps {
  status: TicketStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<TicketStatus, { label: string; className: string }> = {
    open: {
      label: "Open",
      className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
    },
    in_progress: {
      label: "In Progress",
      className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
    },
    pending: {
      label: "Pending",
      className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
    },
    resolved: {
      label: "Resolved",
      className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    },
    closed: {
      label: "Closed",
      className: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    },
  };

  const { label, className: badgeClass } = config[status];

  return (
    <Badge variant="outline" className={`${badgeClass} font-medium ${className || ""}`}>
      {label}
    </Badge>
  );
}
