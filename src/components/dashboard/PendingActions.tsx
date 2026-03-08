import { useEffect, useState } from "react";
import { CheckCircle2, Clock, FileText, AlertCircle, PenTool, CheckCircle, Search as SearchIcon, GraduationCap, Eye, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface PendingAction {
  id: string;
  description: string;
  action_type: string;
  due_date: string | null;
  status: string;
  isOverdue: boolean;
  source: "capa" | "document" | "training" | "reclamacion" | "incidencia";
  documentCode?: string;
  documentId?: string;
  documentStatus?: string;
  workflowHint?: string;
}

const typeIcons: Record<string, typeof CheckCircle2> = {
  immediate: AlertCircle,
  corrective: FileText,
  preventive: CheckCircle2,
  firma: PenTool,
  aprobacion: CheckCircle,
  revision: SearchIcon,
  training: GraduationCap,
  waiting: Eye,
  reclamacion: FileWarning,
  incidencia: AlertCircle,
};

const typeLabels: Record<string, string> = {
  immediate: "Inmediata",
  corrective: "Correctiva",
  preventive: "Preventiva",
  firma: "Firma",
  aprobacion: "Aprobación",
  revision: "Revisión",
  training: "Formación",
  waiting: "En espera",
  reclamacion: "Reclamación",
  incidencia: "Incidencia",
};

interface PendingActionsProps {
  onViewAll: () => void;
  onNavigateToDocument?: (documentCode: string) => void;
  onNavigateToModule?: (module: string) => void;
}

export function PendingActions({ onViewAll, onNavigateToDocument, onNavigateToModule }: PendingActionsProps) {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, profile } = useAuth();

  useEffect(() => {
    async function fetchAll() {
      const now = new Date();

      // Fetch CAPA actions - only from audits in the user's company, assigned to user
      let capaActions: PendingAction[] = [];
      if (user && profile?.company_id) {
        // Get audit IDs for user's company
        const { data: companyAudits } = await (supabase as any)
          .from("audits")
          .select("id")
          .eq("company_id", profile.company_id);

        const auditIds = ((companyAudits as any[]) ?? []).map((a: any) => a.id);

        if (auditIds.length > 0) {
          // Get capa_plan IDs for those audits
          const { data: capaPlans } = await (supabase as any)
            .from("capa_plans")
            .select("id")
            .in("audit_id", auditIds);

          const capaPlanIds = ((capaPlans as any[]) ?? []).map((c: any) => c.id);

          if (capaPlanIds.length > 0) {
            // Get NC IDs for those capa plans
            const { data: ncs } = await (supabase as any)
              .from("non_conformities")
              .select("id")
              .in("capa_plan_id", capaPlanIds);

            const ncIds = ((ncs as any[]) ?? []).map((n: any) => n.id);

            if (ncIds.length > 0) {
              const { data: capaData } = await (supabase as any)
                .from("actions")
                .select("id, description, action_type, due_date, status, responsible_id")
                .in("non_conformity_id", ncIds)
                .in("status", ["open", "in_progress"])
                .order("due_date", { ascending: true, nullsFirst: false })
                .limit(10);

              capaActions = ((capaData as any[]) ?? [])
                .filter((a: any) => !a.responsible_id || a.responsible_id === user.id)
                .map((a: any) => ({
                  id: a.id,
                  description: a.description || "Acción CAPA",
                  action_type: a.action_type,
                  due_date: a.due_date,
                  status: a.status,
                  isOverdue: a.due_date ? new Date(a.due_date) < now : false,
                  source: "capa" as const,
                }));
            }
          }
        }
      }

      // Fetch document responsibilities for current user
      let docActions: PendingAction[] = [];
      if (user) {
        const { data: respData } = await (supabase as any)
          .from("document_responsibilities")
          .select("id, action_type, due_date, status, document_id")
          .eq("user_id", user.id)
          .order("due_date", { ascending: true })
          .limit(20);

        if (respData && (respData as any[]).length > 0) {
          const docIds = [...new Set((respData as any[]).map(r => r.document_id))];
          const { data: docs } = await supabase.from("documents").select("id, code, title, status").in("id", docIds);
          const docMap = new Map((docs || []).map(d => [d.id, d]));

          // Get all responsibilities for these documents (to compute workflow state)
          const { data: allResps } = await (supabase as any)
            .from("document_responsibilities")
            .select("document_id, action_type, status")
            .in("document_id", docIds);

          const respsByDoc = new Map<string, { action_type: string; status: string }[]>();
          for (const r of (allResps as any[] || [])) {
            if (!respsByDoc.has(r.document_id)) respsByDoc.set(r.document_id, []);
            respsByDoc.get(r.document_id)!.push(r);
          }

          // Check which firma responsibilities already have a signature recorded
          const firmaResps = (respData as any[]).filter(r => r.action_type === "firma");
          const firmaDocIds = [...new Set(firmaResps.map(r => r.document_id))];
          let signedSet = new Set<string>();

          if (firmaDocIds.length > 0) {
            const { data: sigs } = await supabase
              .from("document_signatures")
              .select("document_id, signed_by")
              .eq("signed_by", user.id)
              .in("document_id", firmaDocIds);

            for (const sig of (sigs || [])) {
              signedSet.add(`${sig.document_id}:${sig.signed_by}`);
            }
          }

          docActions = (respData as any[])
            .filter((r) => {
              // Exclude completed responsibilities
              if (r.status === "completed") return false;
              // Exclude firma responsibilities that already have a signature
              if (r.action_type === "firma" && signedSet.has(`${r.document_id}:${user.id}`)) {
                return false;
              }
              return true;
            })
            .map((r) => {
              const doc = docMap.get(r.document_id);
              const docStatus = doc?.status || "draft";
              const docResps = respsByDoc.get(r.document_id) || [];
              
              // Compute workflow hint
              let workflowHint = "";
              let effectiveActionType = r.action_type;

              if (r.action_type === "revision") {
                if (docStatus === "review") {
                  const totalReviews = docResps.filter(rr => rr.action_type === "revision").length;
                  const completedReviews = docResps.filter(rr => rr.action_type === "revision" && rr.status === "completed").length;
                  workflowHint = `Debes revisar este documento (${completedReviews}/${totalReviews} revisiones completadas)`;
                } else if (docStatus === "draft") {
                  workflowHint = "Documento aún en borrador — pendiente de pasar a revisión";
                  effectiveActionType = "waiting";
                }
              } else if (r.action_type === "firma") {
                if (docStatus === "pending_signature") {
                  const totalSigs = docResps.filter(rr => rr.action_type === "firma").length;
                  const completedSigs = docResps.filter(rr => rr.action_type === "firma" && rr.status === "completed").length;
                  workflowHint = `Debes firmar este documento (${completedSigs}/${totalSigs} firmas)`;
                } else if (docStatus === "review") {
                  workflowHint = "Documento en revisión — tu firma será requerida después";
                  effectiveActionType = "waiting";
                }
              } else if (r.action_type === "aprobacion") {
                if (docStatus === "pending_signature") {
                  const totalSigs = docResps.filter(rr => rr.action_type === "firma").length;
                  const completedSigs = docResps.filter(rr => rr.action_type === "firma" && rr.status === "completed").length;
                  if (totalSigs > 0 && completedSigs < totalSigs) {
                    workflowHint = `Esperando firmas (${completedSigs}/${totalSigs}) antes de poder aprobar`;
                    effectiveActionType = "waiting";
                  } else {
                    workflowHint = "Todas las firmas completadas — puedes aprobar el documento";
                  }
                } else {
                  workflowHint = "Documento no está listo para aprobación";
                  effectiveActionType = "waiting";
                }
              }

              return {
                id: r.id,
                description: `${typeLabels[r.action_type] || r.action_type}: ${doc?.title || doc?.code || "Documento"}`,
                action_type: effectiveActionType,
                due_date: r.due_date,
                status: r.status,
                isOverdue: r.due_date ? new Date(r.due_date) < now : false,
                source: "document" as const,
                documentCode: doc?.code,
                documentId: r.document_id,
                documentStatus: docStatus,
                workflowHint,
              };
            });
        }
      }

      // Fetch training tasks where current user is a participant and training is not complete
      let trainingActions: PendingAction[] = [];
      if (user) {
        const { data: myParticipations } = await (supabase as any)
          .from("training_participants")
          .select("training_record_id, role")
          .eq("user_id", user.id);

        if (myParticipations && myParticipations.length > 0) {
          const trainingIds = [...new Set(myParticipations.map((p: any) => p.training_record_id))];
          const { data: trainings } = await (supabase as any)
            .from("training_records")
            .select("id, title, status, deadline")
            .in("id", trainingIds)
            .in("status", ["pendiente", "en_proceso"]);

          trainingActions = ((trainings as any[]) ?? []).map((t) => ({
            id: t.id,
            description: `Formación: ${t.title}`,
            action_type: "training",
            due_date: t.deadline,
            status: t.status,
            isOverdue: t.deadline ? new Date(t.deadline) < now : false,
            source: "training" as const,
          }));
        }
      }

      // Fetch reclamaciones assigned to current user (as responsible or participant)
      let reclamacionActions: PendingAction[] = [];
      if (user) {
        // Get reclamaciones where user is responsible
        const { data: recResp } = await (supabase as any)
          .from("reclamaciones")
          .select("id, title, status, response_deadline")
          .eq("responsible_id", user.id)
          .in("status", ["abierta", "en_revision", "en_resolucion"]);

        // Get reclamaciones where user is participant
        const { data: recParts } = await (supabase as any)
          .from("reclamacion_participants")
          .select("reclamacion_id")
          .eq("user_id", user.id);

        const partRecIds = new Set((recParts as any[] || []).map((p: any) => p.reclamacion_id));
        let partReclamaciones: any[] = [];
        if (partRecIds.size > 0) {
          const { data: partRecs } = await (supabase as any)
            .from("reclamaciones")
            .select("id, title, status, response_deadline")
            .in("id", [...partRecIds])
            .in("status", ["abierta", "en_revision", "en_resolucion"]);
          partReclamaciones = partRecs || [];
        }

        // Merge unique
        const allRecs = new Map<string, any>();
        for (const r of [...(recResp || []), ...partReclamaciones]) {
          allRecs.set(r.id, r);
        }

        reclamacionActions = [...allRecs.values()].map((r) => ({
          id: r.id,
          description: `Reclamación: ${r.title}`,
          action_type: "reclamacion",
          due_date: r.response_deadline,
          status: r.status,
          isOverdue: r.response_deadline ? new Date(r.response_deadline) < now : false,
          source: "reclamacion" as const,
        }));
      }

      // Fetch incidencias assigned to current user
      let incidenciaActions: PendingAction[] = [];
      if (user) {
        const { data: incData } = await (supabase as any)
          .from("incidencias")
          .select("id, title, status, deadline, incidencia_type")
          .eq("responsible_id", user.id)
          .in("status", ["open", "in_progress"])
          .order("deadline", { ascending: true, nullsFirst: false })
          .limit(20);

        incidenciaActions = ((incData as any[]) ?? []).map((inc) => ({
          id: inc.id,
          description: `Incidencia: ${inc.title}`,
          action_type: "incidencia",
          due_date: inc.deadline,
          status: inc.status,
          isOverdue: inc.deadline ? new Date(inc.deadline) < now : false,
          source: "incidencia" as const,
        }));
      }

      // Fetch non-conformities assigned to current user
      let ncActions: PendingAction[] = [];
      if (user) {
        const { data: ncData } = await (supabase as any)
          .from("non_conformities")
          .select("id, title, status, deadline, responsible_id")
          .eq("responsible_id", user.id)
          .in("status", ["open", "in_progress"])
          .order("deadline", { ascending: true, nullsFirst: false })
          .limit(20);

        ncActions = ((ncData as any[]) ?? []).map((nc) => ({
          id: nc.id,
          description: `No conformidad: ${nc.title}`,
          action_type: "capa",
          due_date: nc.deadline,
          status: nc.status,
          isOverdue: nc.deadline ? new Date(nc.deadline) < now : false,
          source: "capa" as const,
        }));
      }

      // Combine: active tasks first, waiting tasks last
      const activeActions = [...capaActions, ...ncActions, ...docActions.filter(a => a.action_type !== "waiting"), ...trainingActions, ...reclamacionActions, ...incidenciaActions];
      const waitingActions = docActions.filter(a => a.action_type === "waiting");
      
      const combined = [
        ...activeActions.sort((a, b) => {
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        }),
        ...waitingActions,
      ].slice(0, 12);

      setActions(combined);
      setIsLoading(false);
    }
    void fetchAll();
  }, [user]);

  const overdueCount = actions.filter((a) => a.isOverdue).length;

  const docStatusLabels: Record<string, string> = {
    draft: "Borrador",
    review: "En Revisión",
    pending_signature: "Pend. Firma",
    approved: "Aprobado",
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Acciones Pendientes</h3>
        {overdueCount > 0 && (
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-destructive/10 text-destructive">
            {overdueCount} vencidas
          </span>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm py-4">Cargando...</div>
        ) : actions.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-4">No hay acciones pendientes</div>
        ) : (
          actions.map((action) => {
            const Icon = typeIcons[action.action_type] || FileText;
            const isWaiting = action.action_type === "waiting";
            return (
              <div
                key={action.id}
                className={cn(
                  "p-3 rounded-lg border transition-colors cursor-pointer",
                  isWaiting
                    ? "border-border/50 bg-secondary/20 opacity-70"
                    : action.isOverdue
                      ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
                      : "border-border hover:bg-secondary/50"
                )}
                onClick={() => {
                  if (action.source === "document" && action.documentCode && onNavigateToDocument) {
                    onNavigateToDocument(action.documentCode);
                  } else if (action.source === "capa" && onNavigateToModule) {
                    onNavigateToModule("audits");
                  } else if (action.source === "training" && onNavigateToModule) {
                    onNavigateToModule("training");
                   } else if (action.source === "reclamacion" && onNavigateToModule) {
                     onNavigateToModule("reclamaciones");
                   } else if (action.source === "incidencia" && onNavigateToModule) {
                     onNavigateToModule("incidents");
                   }
                }}
              >
                <div className="flex items-start gap-3">
                  <Icon className={cn("w-4 h-4 mt-0.5",
                    isWaiting ? "text-muted-foreground/50" :
                    action.isOverdue ? "text-destructive" : "text-muted-foreground"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{action.description}</p>
                    {action.workflowHint && (
                      <p className={cn("text-xs mt-0.5", isWaiting ? "text-muted-foreground/70 italic" : "text-accent")}>
                        {action.workflowHint}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{typeLabels[action.action_type] || action.action_type}</span>
                      {action.source === "document" && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {action.documentStatus ? docStatusLabels[action.documentStatus] || action.documentStatus : "Documento"}
                        </span>
                      )}
                      {action.source === "training" && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">Formación</span>
                      )}
                      {action.source === "reclamacion" && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">Reclamación</span>
                      )}
                      {action.source === "incidencia" && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Incidencia</span>
                      )}
                      {action.due_date && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className={cn("text-xs flex items-center gap-1", action.isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                            <Clock className="w-3 h-3" />
                            {format(new Date(action.due_date), "dd/MM/yyyy")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Button variant="outline" className="w-full mt-4" onClick={onViewAll}>
        Ver todas las acciones
      </Button>
    </div>
  );
}
