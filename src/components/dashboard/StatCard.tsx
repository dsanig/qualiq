import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "accent" | "warning" | "success" | "destructive";
  onViewDetail?: () => void;
}

const variantStyles = {
  default: "bg-card",
  accent: "bg-accent/5 border-accent/20",
  warning: "bg-warning/5 border-warning/20",
  success: "bg-success/5 border-success/20",
  destructive: "bg-destructive/5 border-destructive/20",
};

const iconVariantStyles = {
  default: "bg-secondary text-foreground",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
};

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = "default", onViewDetail }: StatCardProps) {
  return (
    <div className={cn("stat-card flex flex-col h-full", variantStyles[variant])}>
      <div className="flex items-start justify-between flex-1">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              "mt-2 text-sm font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}% vs mes anterior
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-lg", iconVariantStyles[variant])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {onViewDetail && (
        <button
          onClick={onViewDetail}
          className="mt-3 w-full text-xs font-medium text-accent hover:text-accent/80 transition-colors text-center py-1.5 rounded-md border border-border hover:bg-secondary/50"
        >
          Ver detalle
        </button>
      )}
    </div>
  );
}
