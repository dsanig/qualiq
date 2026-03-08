import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Lightbulb, 
  BarChart3,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle,
  Target,
  FilePlus2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useAuditLog } from "@/hooks/useAuditLog";

interface PredictiveInsight {
  id: string;
  insight_type: string;
  severity: string;
  title: string;
  description: string;
  pattern_details: {
    type?: string;
    correlation_strength?: number;
    data_points_analyzed?: number;
  } | null;
  affected_areas: string[] | null;
  suggested_actions: string[] | null;
  confidence_score: number | null;
  is_acknowledged: boolean | null;
  source?: Record<string, unknown> | null;
  created_at: string;
}

interface PredictionDataValidation {
  isSufficient: boolean;
  reason?: string;
  recordCount: number;
  windowLabel: string;
}

interface IncidentForAnalysis {
  id: string;
  incidencia_type?: string;
  status: string | null;
  title?: string;
  description?: string | null;
  created_at: string | null;
  deadline?: string | null;
}

type AnalysisWindow = "current" | "1w" | "2w" | "1m" | "3m" | "6m" | "1y";

const ANALYSIS_WINDOW_OPTIONS: Array<{ value: AnalysisWindow; label: string; days?: number }> = [
  { value: "current", label: "Actual" },
  { value: "1w", label: "1 semana", days: 7 },
  { value: "2w", label: "2 semanas", days: 14 },
  { value: "1m", label: "1 mes", days: 30 },
  { value: "3m", label: "3 meses", days: 90 },
  { value: "6m", label: "6 meses", days: 180 },
  { value: "1y", label: "1 año", days: 365 },
];

const DEFAULT_ANALYSIS_WINDOW: AnalysisWindow = "1m";
const STORAGE_WINDOW_KEY = "predictive-analysis-window";
const MIN_RECORDS_BY_WINDOW: Record<AnalysisWindow, number> = {
  current: 1,
  "1w": 1,
  "2w": 1,
  "1m": 1,
  "3m": 1,
  "6m": 1,
  "1y": 1,
};

const OPEN_STATUS_VALUES = ["open", "in_progress", "pending_approval", "abierta", "abierto", "pendiente"];
const CLOSED_STATUS_VALUES = ["closed", "cerrada", "cerrado", "resolved", "resuelta"];

const INSIGHT_TYPE_CONFIG = {
  pattern: { icon: BarChart3, label: "Patrón Detectado", color: "text-accent" },
  trend: { icon: TrendingUp, label: "Tendencia", color: "text-success" },
  risk: { icon: AlertTriangle, label: "Riesgo", color: "text-warning" },
  recommendation: { icon: Lightbulb, label: "Recomendación", color: "text-primary" },
};

const SEVERITY_CONFIG = {
  high: { bg: "bg-destructive/10", border: "border-destructive/30", badge: "destructive" as const },
  medium: { bg: "bg-warning/10", border: "border-warning/30", badge: "secondary" as const },
  low: { bg: "bg-accent/10", border: "border-accent/30", badge: "outline" as const },
};

interface PredictiveAnalyticsViewProps {
  onCreateIncidentFromInsight: (prefill: { title: string; description: string; sourceInsightId: string }) => void;
}

export function PredictiveAnalyticsView({ onCreateIncidentFromInsight }: PredictiveAnalyticsViewProps) {
  const { profile } = useAuth();
  const { logAction } = useAuditLog();
  const [insights, setInsights] = useState<PredictiveInsight[]>([]);
  const [windowInsights, setWindowInsights] = useState<PredictiveInsight[]>([]);
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindow>(DEFAULT_ANALYSIS_WINDOW);
  const [incidentsForWindow, setIncidentsForWindow] = useState<IncidentForAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastValidation, setLastValidation] = useState<PredictionDataValidation | null>(null);

  const windowConfig = useMemo(
    () => ANALYSIS_WINDOW_OPTIONS.find((option) => option.value === analysisWindow) ?? ANALYSIS_WINDOW_OPTIONS[3],
    [analysisWindow],
  );

  useEffect(() => {
    const savedWindow = localStorage.getItem(STORAGE_WINDOW_KEY) as AnalysisWindow | null;
    if (savedWindow && ANALYSIS_WINDOW_OPTIONS.some((option) => option.value === savedWindow)) {
      setAnalysisWindow(savedWindow);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [profile?.company_id, analysisWindow]);

  const getWindowStart = (selectedWindow: AnalysisWindow) => {
    const selected = ANALYSIS_WINDOW_OPTIONS.find((option) => option.value === selectedWindow);
    if (!selected?.days) return null;
    return new Date(Date.now() - selected.days * 24 * 60 * 60 * 1000);
  };

  const isIncidentOpen = (status?: string | null) => {
    const normalized = (status ?? "").toLowerCase();
    if (OPEN_STATUS_VALUES.includes(normalized)) return true;
    if (CLOSED_STATUS_VALUES.includes(normalized)) return false;
    return normalized !== "closed";
  };

  const getIncidentsForWindow = async (selectedWindow: AnalysisWindow): Promise<IncidentForAnalysis[]> => {
    if (!profile?.company_id) return [];

    const periodStart = getWindowStart(selectedWindow);
    const lowerBound = periodStart ? new Date(periodStart.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString() : undefined;

    const { data, error } = await supabase
      .from("incidencias")
      .select("id, incidencia_type, status, title, description, created_at, deadline")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(2000)
      .gte("created_at", lowerBound ?? "1970-01-01T00:00:00.000Z");

    if (error) throw error;

    const incidents = (data ?? []).filter((incident) => {
      if (selectedWindow === "current") {
        return isIncidentOpen(incident.status);
      }

      if (!periodStart) return true;

      const openedAt = new Date(incident.created_at);
      if (!Number.isFinite(openedAt.getTime())) return false;

      /**
       * Interpretación implementada: una incidencia cuenta si su intervalo de apertura
       * se solapa con la ventana [windowStart, now].
       * Como la tabla no expone closed_at/resolved_at, usamos status como proxy:
       * - Abierta: end = now
       * - Cerrada: end = created_at (aproximación conservadora)
       */
      const closedAtProxy = isIncidentOpen(incident.status) ? new Date() : openedAt;
      return openedAt <= new Date() && closedAtProxy >= periodStart;
    });

    return incidents;
  };

  const fetchInsights = async () => {
    setIsLoading(true);
    if (!profile?.company_id) {
      setInsights([]);
      setIsLoading(false);
      return;
    }

    const windowStart = getWindowStart(analysisWindow);

    const { data, error } = await supabase
      .from("predictive_insights")
       .select("*")
      .eq("company_id", profile.company_id)
      .eq("is_acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching insights:", error);
    } else {
      const unreadInsights = (data ?? []) as unknown as PredictiveInsight[];
      setInsights(unreadInsights);
      setWindowInsights(
        windowStart
          ? unreadInsights.filter((insight) => new Date(insight.created_at) >= windowStart)
          : unreadInsights,
      );
    }

    try {
      const incidents = await getIncidentsForWindow(analysisWindow);
      setIncidentsForWindow(incidents);
      setLastValidation(isDataSufficientForPrediction(incidents, analysisWindow));
    } catch (incidentError) {
      console.error("Error fetching incidents for predictive analytics:", incidentError);
      setIncidentsForWindow([]);
      setLastValidation(null);
    }

    setIsLoading(false);
  };

  const isDataSufficientForPrediction = (
    data: Array<{ created_at: string | null }>,
    selectedWindow: AnalysisWindow,
  ): PredictionDataValidation => {
    const minRequiredRecords = MIN_RECORDS_BY_WINDOW[selectedWindow];
    const selectedLabel = ANALYSIS_WINDOW_OPTIONS.find((option) => option.value === selectedWindow)?.label ?? "ventana seleccionada";

    if (data.length < minRequiredRecords) {
      return {
        isSufficient: false,
        reason:
          selectedWindow === "current"
            ? `Se requieren al menos ${minRequiredRecords} incidencias abiertas actualmente para analizar patrones.`
            : `Se requieren al menos ${minRequiredRecords} incidencias dentro de la ventana ${selectedLabel}.`,
        recordCount: data.length,
        windowLabel: selectedLabel,
      };
    }

    return {
      isSufficient: true,
      recordCount: data.length,
      windowLabel: selectedLabel,
    };
  };

  const handleWindowChange = (value: string) => {
    const nextWindow = value as AnalysisWindow;
    setAnalysisWindow(nextWindow);
    localStorage.setItem(STORAGE_WINDOW_KEY, nextWindow);
  };

  const runAnalysis = async () => {
    if (!profile?.company_id) {
      toast({
        title: "Error",
        description: "No se encontró la empresa asociada",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const incidentsData = await getIncidentsForWindow(analysisWindow);

      if (!incidentsData || incidentsData.length === 0) {
        const validation = {
          isSufficient: false,
          reason: `No hay incidencias disponibles para la ventana ${windowConfig.label}.`,
          recordCount: 0,
          windowLabel: windowConfig.label,
        } satisfies PredictionDataValidation;
        setLastValidation(validation);
        toast({
          title: "Sin datos para analizar",
          description: validation.reason,
          variant: "destructive",
        });
        return;
      }

      const validation = isDataSufficientForPrediction(incidentsData, analysisWindow);
      setLastValidation(validation);
      if (!validation.isSufficient) {
        toast({
          title: "Datos insuficientes",
          description: validation.reason,
          variant: "destructive",
        });
        return;
      }

      if (import.meta.env.DEV) {
        console.info("[predictive-analytics] Fuente: incidencias", {
          companyId: profile.company_id,
          records: validation.recordCount,
          window: analysisWindow,
        });
      }

      const { data: fnData, error } = await supabase.functions.invoke("analyze-capa-patterns", {
        body: {
          companyId: profile.company_id,
          incidentsData,
          analysisWindow,
        },
      });

      if (error) {
        // Try to extract backend error message
        const backendMsg = fnData?.error || error.message;
        throw new Error(backendMsg);
      }

      toast({
        title: "Análisis completado",
        description: "Se han detectado nuevos patrones e insights",
      });
      logAction({ action: "run_analysis", entity_type: "predictive_analytics", details: { window: analysisWindow, records: incidentsData.length } });

      fetchInsights();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo ejecutar el análisis predictivo";
      console.error("Error running analysis:", e);
      toast({
        title: "Error en el análisis",
        description: msg,
        variant: "destructive",
      });
    }

    setIsAnalyzing(false);
  };

  const markInsightAsRead = async (insightId: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("predictive_insights")
        .update({
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: userData.user?.id ?? null,
        })
        .eq("id", insightId)
        .eq("company_id", profile?.company_id ?? "");

      if (error) throw error;

      setInsights((prev) => prev.filter((i) => i.id !== insightId));

      toast({
        title: "Insight marcado como leído",
        description: "El insight se ha eliminado del listado.",
      });
      logAction({ action: "acknowledge_insight", entity_type: "predictive_insight", entity_id: insightId });

      fetchInsights();
    } catch (error) {
      console.error("Error marking insight as read:", error);
      toast({
        title: "No se ha podido marcar como leído",
        description: "Inténtalo de nuevo en unos segundos.",
        variant: "destructive",
      });
    }
  };

  const handleCreateIncident = (insight: PredictiveInsight) => {
    const sourceBlock = `\n\nOrigen del insight CAPA:\n- ID Insight: ${insight.id}\n- Tipo: ${insight.insight_type}\n- Severidad: ${insight.severity}`;

    onCreateIncidentFromInsight({
      title: insight.title,
      description: `${insight.description}${sourceBlock}`,
      sourceInsightId: insight.id,
    });
  };

  const handleDeleteInsight = async (insightId: string) => {
    if (!profile?.company_id) return;
    try {
      const { error } = await supabase
        .from("predictive_insights")
        .delete()
        .eq("id", insightId)
        .eq("company_id", profile.company_id);
      if (error) throw error;
      setInsights((prev) => prev.filter((i) => i.id !== insightId));
      setWindowInsights((prev) => prev.filter((i) => i.id !== insightId));
      toast({ title: "Insight eliminado" });
      logAction({ action: "delete", entity_type: "predictive_insight", entity_id: insightId });
    } catch (e: any) {
      toast({ title: "Error al eliminar", description: e.message ?? "Error desconocido.", variant: "destructive" });
    }
  };

  const handleDeleteAllInsights = async () => {
    if (!profile?.company_id) return;
    if (!confirm("¿Eliminar todos los insights del análisis predictivo? Esta acción no se puede deshacer.")) return;

    try {
      const { error } = await supabase
        .from("predictive_insights")
        .delete()
        .eq("company_id", profile.company_id);

      if (error) throw error;

      setInsights([]);
      toast({ title: "Insights eliminados", description: "Se han eliminado todos los resultados del análisis." });
    } catch (e: any) {
      toast({ title: "Error al eliminar", description: e.message ?? "Error desconocido.", variant: "destructive" });
    }
  };

  const unreadWindowInsights = windowInsights.filter((i) => !i.is_acknowledged);
  const unacknowledgedCount = unreadWindowInsights.length;
  const highSeverityCount = unreadWindowInsights.filter((i) => i.severity === "high").length;
  const currentValidation = lastValidation ?? isDataSufficientForPrediction(incidentsForWindow, analysisWindow);
  const canRunAnalysis = currentValidation.isSufficient && !isAnalyzing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Análisis Predictivo de CAPAs</h2>
          <p className="text-sm text-muted-foreground">
            Detecta patrones y previene incidencias antes de que ocurran
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={analysisWindow} onValueChange={handleWindowChange}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Ventana temporal" />
            </SelectTrigger>
            <SelectContent>
              {ANALYSIS_WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runAnalysis} disabled={!canRunAnalysis} title={!canRunAnalysis ? currentValidation.reason : undefined}>
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analizando...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Ejecutar Análisis
            </>
          )}
          </Button>
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <Brain className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{windowInsights.length}</p>
                <p className="text-sm text-muted-foreground">Insights Totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-warning/10">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{highSeverityCount}</p>
                <p className="text-sm text-muted-foreground">Alta Prioridad</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-success/10">
                <Target className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{unacknowledgedCount}</p>
                <p className="text-sm text-muted-foreground">Pendientes de Revisión</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : windowInsights.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">No hay datos suficientes para generar análisis para: {windowConfig.label}.</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              {currentValidation.reason ?? "Registra más incidencias o amplía la ventana temporal."}
            </p>
            <p className="text-xs text-muted-foreground mt-2 text-center max-w-md">
              Registra más incidencias o amplía la ventana temporal para habilitar este módulo.
            </p>
            <Button className="mt-4" onClick={runAnalysis} disabled={!canRunAnalysis}>
              {isAnalyzing ? "Analizando..." : "Ejecutar Primer Análisis"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {windowInsights.map((insight) => {
            const typeConfig = INSIGHT_TYPE_CONFIG[insight.insight_type as keyof typeof INSIGHT_TYPE_CONFIG] || INSIGHT_TYPE_CONFIG.pattern;
            const severityConfig = SEVERITY_CONFIG[insight.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.medium;
            const Icon = typeConfig.icon;

            return (
              <Card 
                key={insight.id} 
                className={`${severityConfig.bg} border ${severityConfig.border}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-background">
                        <Icon className={`w-5 h-5 ${typeConfig.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={severityConfig.badge}>
                            {insight.severity === "high" ? "Alta" : insight.severity === "medium" ? "Media" : "Baja"} prioridad
                          </Badge>
                          <Badge variant="outline">{typeConfig.label}</Badge>
                          {insight.confidence_score && (
                            <Badge variant="secondary">{insight.confidence_score}% confianza</Badge>
                          )}
                        </div>
                        <CardTitle className="text-base">{insight.title}</CardTitle>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreateIncident(insight)}
                      >
                        <FilePlus2 className="w-4 h-4 mr-1" />
                        Crear incidencia
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markInsightAsRead(insight.id)}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Marcar como leído
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteInsight(insight.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="ml-12">
                    {new Date(insight.created_at).toLocaleDateString("es-ES", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-foreground">{insight.description}</p>

                  {insight.affected_areas && insight.affected_areas.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Áreas Afectadas:</p>
                      <div className="flex flex-wrap gap-2">
                        {insight.affected_areas.map((area, idx) => (
                          <Badge key={idx} variant="outline">{area}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {insight.suggested_actions && insight.suggested_actions.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Acciones Sugeridas:</p>
                      <ul className="space-y-1">
                        {insight.suggested_actions.map((action, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-accent">•</span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {insight.pattern_details?.correlation_strength && (
                    <div className="text-xs text-muted-foreground">
                      Fuerza de correlación: {Math.round(insight.pattern_details.correlation_strength * 100)}%
                      {insight.pattern_details.data_points_analyzed && (
                        <> • {insight.pattern_details.data_points_analyzed} puntos de datos analizados</>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
