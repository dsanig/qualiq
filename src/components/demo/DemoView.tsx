import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, FileText, AlertTriangle, ClipboardCheck, BarChart3,
  ArrowLeft, CheckCircle, Clock, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { demoIncidents, demoDocuments, demoAudits, demoStats } from "@/data/demoData";

const tabs = [
  { id: "dashboard", label: "Panel", icon: BarChart3 },
  { id: "documents", label: "Documentos", icon: FileText },
  { id: "incidents", label: "Incidencias", icon: AlertTriangle },
  { id: "audits", label: "Auditorías", icon: ClipboardCheck },
];

const statusColors: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  in_progress: "bg-warning/10 text-warning",
  closed: "bg-success/10 text-success",
  approved: "bg-success/10 text-success",
  review: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  open: "Abierto", in_progress: "En curso", closed: "Cerrado",
  approved: "Aprobado", review: "En revisión", draft: "Borrador",
};

export function DemoView() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Shield className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-bold text-foreground">QualiQ</span>
            <Badge variant="outline" className="text-xs">DEMO</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === t.id
                  ? "bg-accent text-accent-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Info banner */}
        <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mb-6 text-sm text-accent">
          Estás en modo demostración. Los datos son de ejemplo y no se pueden modificar.
        </div>

        {/* Content */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Documentos Activos", value: demoStats.documents, sub: `${demoStats.documentsReview} en revisión`, icon: FileText },
                { label: "Incidencias Abiertas", value: demoStats.openIncidents, icon: AlertTriangle },
                { label: "CAPAs en Curso", value: demoStats.activeCAPAs, icon: Clock },
                { label: "SOPs Actualizados", value: demoStats.sopCoverage, icon: CheckCircle },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <s.icon className="w-4 h-4" />
                    <span className="text-xs">{s.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{s.value}</p>
                  {s.sub && <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>}
                </div>
              ))}
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold text-foreground mb-1">Score de Cumplimiento</h3>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold text-accent">{demoStats.complianceScore}%</span>
                <div className="flex items-center gap-1 text-success text-sm mb-1">
                  <TrendingUp className="w-4 h-4" /> +3% este mes
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-3 font-medium text-muted-foreground">Código</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Título</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Estado</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Versión</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {demoDocuments.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{d.code}</td>
                    <td className="p-3 text-foreground">{d.title}</td>
                    <td className="p-3"><span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[d.status])}>{statusLabels[d.status]}</span></td>
                    <td className="p-3">v{d.version}</td>
                    <td className="p-3 text-muted-foreground">{d.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "incidents" && (
          <div className="space-y-3">
            {demoIncidents.map((inc) => (
              <div key={inc.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground text-sm">{inc.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{inc.area} · {inc.date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{inc.priority}</Badge>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[inc.status])}>
                    {statusLabels[inc.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "audits" && (
          <div className="space-y-3">
            {demoAudits.map((a) => (
              <div key={a.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-foreground text-sm">{a.title}</p>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[a.status])}>
                    {statusLabels[a.status]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Auditor: {a.auditor} · Fecha: {a.date} · {a.findings} hallazgos
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
