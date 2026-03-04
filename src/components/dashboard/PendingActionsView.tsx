import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, FileText, AlertCircle, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PendingAction {
  id: string;
  title: string;
  type: "approval" | "review" | "update" | "capa";
  dueDate: string;
  isOverdue: boolean;
  owner: string;
}

const typeIcons = {
  approval: CheckCircle2,
  review: FileText,
  update: FileText,
  capa: AlertCircle,
};

const typeLabels = {
  approval: "Aprobación",
  review: "Revisión",
  update: "Actualización",
  capa: "CAPA",
};

const mapIncidentTypeToPendingType = (incidentType: string): PendingAction["type"] => {
  if (incidentType === "capa") return "capa";
  if (incidentType === "deviation" || incidentType === "non_conformity") return "review";
  if (incidentType === "change") return "update";
  return "approval";
};

export function PendingActionsView() {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActions = async () => {
      if (!profile?.company_id) {
        setActions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data: incidents, error: incidentsError } = await (supabase as any)
        .from("incidencias")
        .select("id, title, incidencia_type, deadline, responsible_id")
        .eq("company_id", profile.company_id)
        .in("status", ["open", "in_progress"])
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(100);

      if (incidentsError || !incidents) {
        console.error("Error fetching pending actions:", incidentsError);
        setActions([]);
        setIsLoading(false);
        return;
      }

      const responsibleIds = Array.from(
        new Set(
          incidents
            .map((incident: { responsible_id: string | null }) => incident.responsible_id)
            .filter((id: string | null): id is string => Boolean(id))
        )
      );

      let responsibleMap = new Map<string, string>();
      if (responsibleIds.length > 0) {
        const { data: responsibles } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", responsibleIds);

        responsibleMap = new Map(
          (responsibles || []).map((r: { user_id: string; full_name: string | null }) => [r.user_id, r.full_name || "Sin asignar"])
        );
      }

      const today = new Date().toISOString().split("T")[0];
      const mappedActions: PendingAction[] = incidents.map(
        (incident: { id: string; title: string; incidencia_type: string; deadline: string | null; responsible_id: string | null }) => ({
          id: incident.id,
          title: incident.title,
          type: mapIncidentTypeToPendingType(incident.incidencia_type),
          dueDate: incident.deadline || "Sin fecha límite",
          isOverdue: Boolean(incident.deadline && incident.deadline < today),
          owner: incident.responsible_id ? responsibleMap.get(incident.responsible_id) || "Sin asignar" : "Sin asignar",
        })
      );

      setActions(mappedActions);
      setIsLoading(false);
    };

    void fetchActions();
  }, [profile?.company_id]);

  const filteredActions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return actions.filter(
      (action) => !query || action.title.toLowerCase().includes(query) || action.owner.toLowerCase().includes(query)
    );
  }, [actions, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar acciones pendientes..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="accent">Actualizar prioridades</Button>
      </div>

      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Acciones pendientes</h3>
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-destructive/10 text-destructive">
            {actions.filter((a) => a.isOverdue).length} vencidas
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay acciones pendientes con datos reales.</p>
        ) : (
          <div className="space-y-3">
            {filteredActions.map((action) => {
              const Icon = typeIcons[action.type];
              return (
                <div
                  key={action.id}
                  className={cn(
                    "p-4 rounded-lg border transition-colors",
                    action.isOverdue
                      ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
                      : "border-border hover:bg-secondary/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn("w-4 h-4 mt-0.5", action.isOverdue ? "text-destructive" : "text-muted-foreground")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{action.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{typeLabels[action.type]}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className={cn("text-xs flex items-center gap-1", action.isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                          <Clock className="w-3 h-3" />
                          {action.dueDate}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">Responsable: {action.owner}</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Revisar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
