import { useEffect, useState, useCallback } from "react";
import { ClipboardList, CheckCircle2, Clock, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const statusLabels: Record<string, string> = {
  draft: "Borrador",
  review: "En Revisión",
  pending_signature: "Pendiente de Firma",
  pending_approval: "Pendiente de Aprobación",
  approved: "Aprobado",
};

/** Given the current doc status, return the next allowed manual transition for the responsible */
function getNextStatusForAction(docStatus: string | undefined, actionType: string): { nextStatus: string; label: string } | null {
  if (!docStatus) return null;
  // draft → review: any reviewer can trigger this
  if (docStatus === "draft" && actionType === "revision") {
    return { nextStatus: "review", label: "Pasar a En Revisión" };
  }
  // pending_approval → approved: approval responsible triggers this
  if (docStatus === "pending_approval" && actionType === "aprobacion") {
    return { nextStatus: "approved", label: "Aprobar documento" };
  }
  return null;
}

const actionTypeLabels: Record<string, string> = {
  firma: "Firma",
  aprobacion: "Aprobación",
  revision: "Revisión",
};

const actionTypeColors: Record<string, string> = {
  firma: "bg-primary/10 text-primary",
  aprobacion: "bg-success/10 text-success",
  revision: "bg-warning/10 text-warning",
};

interface PendingAction {
  id: string;
  document_id: string;
  user_id: string;
  action_type: string;
  due_date: string;
  status: string;
  completed_at: string | null;
  documentCode?: string;
  documentTitle?: string;
  documentStatus?: string;
  responsibleName?: string;
}

interface DocumentPendingActionsProps {
  /** If provided, only show actions for this document */
  documentId?: string;
  /** Called after an action is completed so parent can refresh */
  onActionCompleted?: () => void;
  /** Compact mode for sidebar/inline use */
  compact?: boolean;
}

export function DocumentPendingActions({ documentId, onActionCompleted, compact = false }: DocumentPendingActionsProps) {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchActions = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    let query = (supabase as any)
      .from("document_responsibilities")
      .select("id, document_id, user_id, action_type, due_date, status, completed_at")
      .eq("status", "pending")
      .order("due_date", { ascending: true });

    if (documentId) {
      query = query.eq("document_id", documentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching pending actions:", error);
      setIsLoading(false);
      return;
    }

    const pendingActions = (data || []) as PendingAction[];

    if (pendingActions.length > 0) {
      // Fetch document info and user names in parallel
      const docIds = [...new Set(pendingActions.map((a: PendingAction) => a.document_id))];
      const userIds = [...new Set(pendingActions.map((a: PendingAction) => a.user_id))];

      const [docsRes, usersRes] = await Promise.all([
        supabase.from("documents").select("id, code, title, status").in("id", docIds),
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds),
      ]);

      const docMap = new Map((docsRes.data || []).map(d => [d.id, { code: d.code, title: d.title, status: (d as any).status }]));
      const userMap = new Map((usersRes.data || []).map(u => [u.user_id, u.full_name || u.email || u.user_id]));

      for (const action of pendingActions) {
        const doc = docMap.get(action.document_id);
        action.documentCode = doc?.code || "";
        action.documentTitle = doc?.title || "";
        action.documentStatus = doc?.status || "";
        action.responsibleName = userMap.get(action.user_id) || action.user_id;
      }
    }

    setActions(pendingActions);
    setIsLoading(false);
  }, [user, documentId]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleComplete = async (action: PendingAction) => {
    if (!user || action.user_id !== user.id) {
      toast({ title: "Error", description: "Solo el responsable asignado puede completar esta acción.", variant: "destructive" });
      return;
    }

    // Validate document status matches the action type
    const docStatus = action.documentStatus;
    if (action.action_type === "revision" && docStatus !== "review") {
      toast({ title: "No permitido", description: "Solo se puede revisar un documento en estado 'En Revisión'.", variant: "destructive" });
      return;
    }
    if (action.action_type === "firma" && docStatus !== "pending_signature") {
      toast({ title: "No permitido", description: "Solo se puede firmar un documento en estado 'Pendiente de Firma'.", variant: "destructive" });
      return;
    }
    if (action.action_type === "aprobacion" && docStatus !== "pending_approval") {
      toast({ title: "No permitido", description: "Solo se puede aprobar un documento en estado 'Pendiente de Aprobación'.", variant: "destructive" });
      return;
    }

    setCompletingId(action.id);
    try {
      const { error } = await (supabase as any)
        .from("document_responsibilities")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", action.id);

      if (error) throw error;

      const label = action.action_type === "revision" ? "Revisión completada" : action.action_type === "firma" ? "Firma registrada" : action.action_type === "aprobacion" ? "Aprobación registrada" : "Acción completada";
      toast({ title: label, description: `Acción completada para ${action.documentCode}` });

      setActions(prev => prev.filter(a => a.id !== action.id));
      onActionCompleted?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCompletingId(null);
    }
  };

  const [changingStatusDocId, setChangingStatusDocId] = useState<string | null>(null);

  const handleChangeDocumentStatus = async (action: PendingAction, nextStatus: string) => {
    if (!user || action.user_id !== user.id) {
      toast({ title: "Error", description: "Solo el responsable asignado puede cambiar el estado.", variant: "destructive" });
      return;
    }

    setChangingStatusDocId(action.document_id);
    try {
      const { error: updateError } = await supabase.from("documents").update({
        status: nextStatus as any,
      }).eq("id", action.document_id);
      if (updateError) throw updateError;

      // Record the status change
      const { error: insertError } = await (supabase as any).from("document_status_changes").insert({
        document_id: action.document_id,
        old_status: action.documentStatus,
        new_status: nextStatus,
        changed_by: user.id,
        comment: `Cambio de estado desde acciones pendientes`,
      });
      if (insertError) throw insertError;

      const fromLabel = statusLabels[action.documentStatus || ""] || action.documentStatus;
      const toLabel = statusLabels[nextStatus] || nextStatus;
      toast({ title: "Estado actualizado", description: `${action.documentCode}: ${fromLabel} → ${toLabel}` });

      // If approving, also complete the action
      if (nextStatus === "approved" && action.action_type === "aprobacion") {
        await (supabase as any)
          .from("document_responsibilities")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", action.id);
        setActions(prev => prev.filter(a => a.id !== action.id));
      } else {
        // Refresh to pick up new document status
        fetchActions();
      }

      onActionCompleted?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingStatusDocId(null);
    }
  };

  const now = new Date();

  if (isLoading) {
    return (
      <div className={cn("text-center text-muted-foreground text-sm", compact ? "py-3" : "py-6")}>
        Cargando...
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className={cn("text-center text-muted-foreground text-sm", compact ? "py-3" : "py-6")}>
        <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-success" />
        Sin acciones pendientes
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      {actions.map(action => {
        const isOverdue = new Date(action.due_date) < now;
        const isActionableStatus =
          (action.action_type === "revision" && action.documentStatus === "review") ||
          (action.action_type === "firma" && action.documentStatus === "pending_signature") ||
          (action.action_type === "aprobacion" && action.documentStatus === "pending_approval");
        const canComplete = isActionableStatus;
        const nextTransition = getNextStatusForAction(action.documentStatus, action.action_type);
        const canChangeStatus = !isActionableStatus && nextTransition && user && action.user_id === user.id;

        return (
          <div
            key={action.id}
            className={cn(
              "border rounded-lg p-3 flex flex-col gap-2",
              isOverdue ? "border-destructive/30 bg-destructive/5" : "border-border bg-card",
              compact && "p-2"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {!documentId && (
                  <p className={cn("font-medium text-foreground truncate", compact ? "text-xs" : "text-sm")}>
                    {action.documentCode} — {action.documentTitle}
                  </p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Badge variant="outline" className={cn("text-xs", actionTypeColors[action.action_type])}>
                    {actionTypeLabels[action.action_type] || action.action_type}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-secondary/50">
                    {statusLabels[action.documentStatus || ""] || action.documentStatus}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    → {action.responsibleName}
                  </span>
                  <span className={cn(
                    "text-xs flex items-center gap-1",
                    isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {format(new Date(action.due_date), "dd/MM/yyyy")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canChangeStatus && nextTransition && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "text-primary border-primary/30 hover:bg-primary/10",
                      compact && "h-7 text-xs px-2"
                    )}
                    onClick={() => handleChangeDocumentStatus(action, nextTransition.nextStatus)}
                    disabled={changingStatusDocId === action.document_id}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                    {changingStatusDocId === action.document_id ? "..." : nextTransition.label}
                  </Button>
                )}
                {canComplete && user && action.user_id === user.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "text-success border-success/30 hover:bg-success/10",
                      compact && "h-7 text-xs px-2"
                    )}
                    onClick={() => handleComplete(action)}
                    disabled={completingId === action.id}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {completingId === action.id
                      ? "..."
                      : action.action_type === "firma"
                      ? "Firmado"
                      : action.action_type === "revision"
                      ? "Revisado"
                      : action.action_type === "aprobacion"
                      ? "Aprobado"
                      : "Completar"}
                  </Button>
                )}
                {!isActionableStatus && !canChangeStatus && (
                  <span className={cn("text-xs text-muted-foreground italic", compact && "text-[10px]")}>
                    {action.action_type === "revision" ? "Esperando estado 'En Revisión'" 
                     : action.action_type === "firma" ? "Esperando estado 'Pendiente de Firma'"
                     : action.action_type === "aprobacion" ? "Esperando estado 'Pendiente de Aprobación'"
                     : "No disponible"}
                  </span>
                )}
              </div>
          </div>
        );
      })}
    </div>
  );
}
