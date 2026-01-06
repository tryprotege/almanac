import { LucideIcon } from "lucide-react";
import { FeaturedIcon } from "./FeaturedIcon";

type IconColor = "purple" | "blue" | "orange" | "indigo" | "green" | "gray";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  iconColor: IconColor;
  loading?: boolean;
  tooltip?: string;
}

export function MetricCard({
  title,
  value,
  icon,
  iconColor,
  loading,
  tooltip,
}: MetricCardProps) {
  if (loading) {
    return (
      <div className="metric-card animate-pulse">
        <div className="w-12 h-12 bg-bg-active rounded-full" />
        <div className="metric-card-content">
          <div className="h-4 bg-bg-active rounded w-20 mb-2" />
          <div className="h-8 bg-bg-active rounded w-16" />
        </div>
      </div>
    );
  }

  return (
    <div className="metric-card" title={tooltip}>
      <FeaturedIcon icon={icon} color={iconColor} />
      <div className="metric-card-content">
        <span className="metric-card-title">{title}</span>
        <span className="metric-card-value">{value}</span>
      </div>
    </div>
  );
}
