import { Wifi, Monitor, Code, Shield, HelpCircle } from "lucide-react";
import { type TicketCategory } from "@workspace/api-client-react/src/generated/api.schemas";

interface CategoryIconProps {
  category: TicketCategory;
  className?: string;
}

export function CategoryIcon({ category, className }: CategoryIconProps) {
  const icons: Record<TicketCategory, React.ElementType> = {
    network: Wifi,
    hardware: Monitor,
    software: Code,
    security: Shield,
    other: HelpCircle,
  };

  const Icon = icons[category];

  return <Icon className={className} />;
}

export function getCategoryLabel(category: TicketCategory): string {
  const labels: Record<TicketCategory, string> = {
    network: "Network",
    hardware: "Hardware",
    software: "Software",
    security: "Security",
    other: "Other",
  };
  return labels[category];
}
