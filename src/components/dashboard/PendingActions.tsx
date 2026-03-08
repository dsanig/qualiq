import { useEffect, useState } from "react";
import { CheckCircle2, Clock, FileText, AlertCircle, PenTool, CheckCircle, Search as SearchIcon, GraduationCap } from "lucide-react";
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
  source: "capa" | "document" | "training";
  documentCode?: string;
  documentId?: string;
}

const typeIcons: Record<string, typeof CheckCircle2> = {
  immediate: AlertCircle,
  corrective: FileText,
  preventive: CheckCircle2,
  firma: PenTool,
  aprobacion: CheckCircle,
  revision: SearchIcon,
  training: GraduationCap,
};

const typeLabels: Record<string, string> = {
  immediate: "Inmediata",
  corrective: "Correctiva",
  preventive: "Preventiva",
  firma: "Firma",
  aprobacion: "Aprobación",
  revision: "Revisión",
};

interface PendingActionsProps {
  onViewAll: () => void;
  onNavigateToDocument?: (documentCode: string) => void;
  onNavigateToModule?: (module: string) => void;
}

export function PendingActions({ onViewAll, onNavigateToDocument, onNavigateToModule }: PendingActionsProps) {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchAll() {
      const now = new Date();

      // Fetch CAPA actions
      const { data: capaData } = await (supabase as any)
        .from("actions")
        .select("id, description, action_type, due_date, status")
        .in("status", ["open", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(5);

      const capaActions: PendingAction[] = ((capaData as any[]) ?? []).map((a) => ({
        ...a,
        isOverdue: a.due_date ? new Date(a.due_date) < now : false,
        source: "capa" as const,
      }));

      // Fetch document responsibilities for current user
      let docActions: PendingAction[] = [];
      if (user) {
        const { data: respData } = await (supabase as any)
          .from("document_responsibilities")
          .select("id, action_type, due_date, status, document_id")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("due_date", { ascending: true })
          .limit(10);

        if (respData && (respData as any[]).length > 0) {
          const docIds = [...new Set((respData as any[]).map(r => r.document_id))];
          const { data: docs } = await supabase.from("documents").select("id, code, title").in("id", docIds);
          const docMap = new Map((docs || []).map(d => [d.id, d]));

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
              // Exclude firma responsibilities that already have a signature
              if (r.action_type === "firma" && signedSet.has(`${r.document_id}:${user.id}`)) {
                return false;
              }
              return true;
            })
            .map((r) => {
              const doc = docMap.get(r.document_id);
              return {
                id: r.id,
                description: `${typeLabels[r.action_type] || r.action_type}: ${doc?.title || doc?.code || "Documento"}`,
                action_type: r.action_type,
                due_date: r.due_date,
                status: r.status,
                isOverdue: r.due_date ? new Date(r.due_date) < now : false,
                source: "document" as const,
                documentCode: doc?.code,
                documentId: r.document_id,
              };
            });
        }
      }

      // Combine and sort by due_date
      const combined = [...capaActions, ...docActions].sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }).slice(0, 8);

      setActions(combined);
      setIsLoading(false);
    }
    void fetchAll();
  }, [user]);

  const overdueCount = actions.filter((a) => a.isOverdue).length;

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
            return (
              <div
                key={action.id}
                className={cn(
                  "p-3 rounded-lg border transition-colors cursor-pointer",
                  action.isOverdue
                    ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
                    : "border-border hover:bg-secondary/50"
                )}
                onClick={() => {
                  if (action.source === "document" && action.documentCode && onNavigateToDocument) {
                    onNavigateToDocument(action.documentCode);
                  } else if (action.source === "capa" && onNavigateToModule) {
                    onNavigateToModule("audits");
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <Icon className={cn("w-4 h-4 mt-0.5", action.isOverdue ? "text-destructive" : "text-muted-foreground")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{action.description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{typeLabels[action.action_type] || action.action_type}</span>
                      {action.source === "document" && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">Documento</span>
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
