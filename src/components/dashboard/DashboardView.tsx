import { useEffect, useState } from "react";
import { FileText, AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { StatCard } from "./StatCard";
import { RecentIncidents } from "./RecentIncidents";
import { ComplianceScore } from "./ComplianceScore";
import { PendingActions } from "./PendingActions";
import { supabase } from "@/integrations/supabase/client";

interface DashboardViewProps {
  onQuickAction: (action: string) => void;
  onViewPendingActions: () => void;
  onViewIncidents: () => void;
  onNavigateToDocument?: (documentCode: string) => void;
  onNavigateToModule?: (module: string) => void;
}

interface DashboardStats {
  totalDocs: number;
  docsInReview: number;
  openIncidents: number;
  overdueIncidents: number;
  activeCAPAs: number;
  approvedDocsPct: string;
}

export function DashboardView({ onQuickAction, onViewPendingActions, onViewIncidents, onNavigateToDocument, onNavigateToModule }: DashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalDocs: 0,
    docsInReview: 0,
    openIncidents: 0,
    overdueIncidents: 0,
    activeCAPAs: 0,
    approvedDocsPct: "0%",
  });

  useEffect(() => {
    async function fetchStats() {
      const [docsRes, docsReviewRes, incRes, capasRes, overdueRes] = await Promise.all([
        (supabase as any).from("documents").select("id", { count: "exact", head: true }),
        (supabase as any).from("documents").select("id", { count: "exact", head: true }).eq("status", "review"),
        (supabase as any).from("incidencias").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        (supabase as any).from("actions").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        (supabase as any).from("incidencias").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]).lt("deadline", new Date().toISOString().split("T")[0]),
      ]);

      const totalDocs = docsRes.count ?? 0;
      const docsInReview = docsReviewRes.count ?? 0;
      const openIncidents = incRes.count ?? 0;
      const activeCAPAs = capasRes.count ?? 0;
      const overdueIncidents = overdueRes.count ?? 0;

      // Approved docs percentage
      const approvedRes = await (supabase as any).from("documents").select("id", { count: "exact", head: true }).eq("status", "approved");
      const approved = approvedRes.count ?? 0;
      const pct = totalDocs > 0 ? Math.round((approved / totalDocs) * 100) : 0;

      setStats({
        totalDocs,
        docsInReview,
        openIncidents,
        overdueIncidents,
        activeCAPAs,
        approvedDocsPct: `${pct}%`,
      });
    }

    void fetchStats();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Documentos Activos"
          value={stats.totalDocs}
          subtitle={`${stats.docsInReview} pendientes de revisión`}
          icon={FileText}
          variant="default"
          onViewDetail={() => onNavigateToModule?.("documents")}
        />
        <StatCard
          title="Incidencias Abiertas"
          value={stats.openIncidents}
          icon={AlertTriangle}
          variant="warning"
          onViewDetail={() => onNavigateToModule?.("incidents")}
        />
        <StatCard
          title="Incidencias Vencidas"
          value={stats.overdueIncidents}
          icon={AlertTriangle}
          variant={stats.overdueIncidents > 0 ? "destructive" : "default"}
          onViewDetail={() => onNavigateToModule?.("incidents")}
        />
        <StatCard
          title="Acciones en Curso"
          value={stats.activeCAPAs}
          icon={Clock}
          variant="accent"
          onViewDetail={() => onNavigateToModule?.("audits")}
        />
        <StatCard
          title="SOPs Aprobados"
          value={stats.approvedDocsPct}
          icon={CheckCircle}
          variant="success"
          onViewDetail={() => onNavigateToModule?.("documents")}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentIncidents onViewAll={onViewIncidents} onSelectIncident={onViewIncidents} />
        </div>
        <div>
          <ComplianceScore />
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PendingActions onViewAll={onViewPendingActions} onNavigateToDocument={onNavigateToDocument} onNavigateToModule={onNavigateToModule} />
        
        {/* Quick Actions */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Acceso Rápido</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Nuevo Documento", icon: FileText },
              { label: "Registrar Incidencia", icon: AlertTriangle },
              { label: "Crear CAPA", icon: CheckCircle },
              { label: "Registrar Reclamación", icon: TrendingUp },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => onQuickAction(action.label)}
                className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-left"
              >
                <action.icon className="w-5 h-5 text-accent" />
                <span className="text-sm font-medium text-foreground">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
