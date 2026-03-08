import { useEffect, useState, useCallback } from "react";
import { ClipboardList, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
      toast({ title: "No permitido", description: "Solo se puede aprobar un documento en estado 'En Aprobación'.", variant: "destructive" });
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
        const canComplete = action.action_type === "revision" || action.action_type === "firma";

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
              {canComplete && user && action.user_id === user.id && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "text-success border-success/30 hover:bg-success/10 shrink-0",
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
                    : "Completar"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
