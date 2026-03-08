import { useEffect, useState } from "react";
import { Shield, FileText, AlertTriangle, CheckCircle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PendingItem {
  id: string;
  label: string;
  status: string;
  type: "doc" | "inc" | "action";
  deadline?: string | null;
}

export function ComplianceScore() {
  const [docsPct, setDocsPct] = useState(0);
  const [incPct, setIncPct] = useState(0);
  const [actionsPct, setActionsPct] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    async function fetch() {
      const [totalDocsRes, approvedDocsRes, totalIncRes, closedIncRes, totalActRes, closedActRes] = await Promise.all([
        (supabase as any).from("documents").select("id", { count: "exact", head: true }),
        (supabase as any).from("documents").select("id", { count: "exact", head: true }).eq("status", "approved"),
        (supabase as any).from("incidencias").select("id", { count: "exact", head: true }),
        (supabase as any).from("incidencias").select("id", { count: "exact", head: true }).eq("status", "closed"),
        (supabase as any).from("actions").select("id", { count: "exact", head: true }),
        (supabase as any).from("actions").select("id", { count: "exact", head: true }).eq("status", "closed"),
      ]);

      const totalDocs = totalDocsRes.count ?? 0;
      const approved = approvedDocsRes.count ?? 0;
      const totalInc = totalIncRes.count ?? 0;
      const closedInc = closedIncRes.count ?? 0;
      const totalAct = totalActRes.count ?? 0;
      const closedAct = closedActRes.count ?? 0;

      setDocsPct(totalDocs > 0 ? Math.round((approved / totalDocs) * 100) : 0);
      setIncPct(totalInc > 0 ? Math.round((closedInc / totalInc) * 100) : 0);
      setActionsPct(totalAct > 0 ? Math.round((closedAct / totalAct) * 100) : 0);
    }
    void fetch();
  }, []);

  const score = Math.round((docsPct + incPct + actionsPct) / 3);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  async function loadDetail() {
    setLoadingDetail(true);
    setShowDetail(true);

    const [docsRes, incRes, actRes] = await Promise.all([
      (supabase as any).from("documents").select("id, title, code, status").neq("status", "approved"),
      (supabase as any).from("incidencias").select("id, title, status, deadline").neq("status", "closed"),
      (supabase as any).from("actions").select("id, description, action_type, status, due_date").neq("status", "closed"),
    ]);

    const statusLabels: Record<string, string> = {
      draft: "Borrador",
      review: "En revisión",
      pending_signature: "Pendiente firma",
      pending_approval: "Pendiente aprobación",
      obsolete: "Obsoleto",
      archived: "Archivado",
      open: "Abierta",
      in_progress: "En proceso",
    };

    const items: PendingItem[] = [];

    (docsRes.data ?? []).forEach((d: any) => {
      items.push({
        id: d.id,
        label: `${d.code} — ${d.title}`,
        status: statusLabels[d.status] ?? d.status,
        type: "doc",
      });
    });

    (incRes.data ?? []).forEach((i: any) => {
      items.push({
        id: i.id,
        label: i.title,
        status: statusLabels[i.status] ?? i.status,
        type: "inc",
        deadline: i.deadline,
      });
    });

    (actRes.data ?? []).forEach((a: any) => {
      items.push({
        id: a.id,
        label: a.description || a.action_type,
        status: statusLabels[a.status] ?? a.status,
        type: "action",
        deadline: a.due_date,
      });
    });

    setPendingItems(items);
    setLoadingDetail(false);
  }

  const today = new Date().toISOString().split("T")[0];

  const docItems = pendingItems.filter((i) => i.type === "doc");
  const incItems = pendingItems.filter((i) => i.type === "inc");
  const actionItems = pendingItems.filter((i) => i.type === "action");

  return (
    <>
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Índice de Cumplimiento</h3>
        </div>

        <div className="flex items-center justify-center py-4">
          <div className="relative">
            <svg className="w-32 h-32 -rotate-90">
              <circle cx="64" cy="64" r="45" stroke="currentColor" strokeWidth="10" fill="none" className="text-secondary" />
              <circle cx="64" cy="64" r="45" stroke="currentColor" strokeWidth="10" fill="none" strokeLinecap="round"
                className="text-accent transition-all duration-1000"
                style={{ strokeDasharray: circumference, strokeDashoffset }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-foreground">{score}%</span>
              <span className="text-xs text-muted-foreground">Puntuación</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 mt-4">
          {[
            { label: "Documentación", pct: docsPct, color: "bg-success" },
            { label: "Incidencias resueltas", pct: incPct, color: "bg-accent" },
            { label: "Acciones cerradas", pct: actionsPct, color: "bg-warning" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.pct}%` }} />
                </div>
                <span className="text-foreground font-medium">{item.pct}%</span>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="w-full mt-4" onClick={loadDetail}>
          Ver detalle
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              Detalle de Cumplimiento — {score}%
            </DialogTitle>
            <DialogDescription>
              Elementos pendientes para alcanzar el 100% de cumplimiento.
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">Cargando...</div>
          ) : pendingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-12 h-12 text-success mb-2" />
              <p className="text-foreground font-semibold">¡Cumplimiento al 100%!</p>
              <p className="text-sm text-muted-foreground">No hay elementos pendientes.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-6">
                {/* Documentos */}
                {docItems.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-4 h-4 text-success" />
                      <h4 className="font-semibold text-foreground text-sm">
                        Documentos sin aprobar ({docItems.length})
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {docItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                          <span className="text-foreground truncate mr-2">{item.label}</span>
                          <span className="text-muted-foreground whitespace-nowrap text-xs bg-secondary px-2 py-0.5 rounded">
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Incidencias */}
                {incItems.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-accent" />
                      <h4 className="font-semibold text-foreground text-sm">
                        Incidencias abiertas ({incItems.length})
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {incItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                          <span className="text-foreground truncate mr-2">{item.label}</span>
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {item.deadline && (
                              <span className={`text-xs ${item.deadline < today ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {item.deadline}
                              </span>
                            )}
                            <span className="text-xs bg-secondary px-2 py-0.5 rounded text-muted-foreground">
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Acciones */}
                {actionItems.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-4 h-4 text-warning" />
                      <h4 className="font-semibold text-foreground text-sm">
                        Acciones correctivas abiertas ({actionItems.length})
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {actionItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                          <span className="text-foreground truncate mr-2">{item.label}</span>
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {item.deadline && (
                              <span className={`text-xs ${item.deadline < today ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {item.deadline}
                              </span>
                            )}
                            <span className="text-xs bg-secondary px-2 py-0.5 rounded text-muted-foreground">
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
