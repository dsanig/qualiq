import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Lightbulb, 
  BarChart3,
  Loader2,
  RefreshCw,
  CheckCircle,
  Target,
  FilePlus2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

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
  is_acknowledged: boolean;
  read_at?: string | null;
  read_by?: string | null;
  source?: Record<string, unknown> | null;
  created_at: string;
}

interface PredictionDataValidation {
  isSufficient: boolean;
  reason?: string;
  recordCount: number;
  rangeDays: number;
}

const PREDICTION_MIN_RECORDS = 10;
const PREDICTION_MIN_RANGE_DAYS = 30;
const PREDICTION_LOOKBACK_DAYS = 90;

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
  const [insights, setInsights] = useState<PredictiveInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastValidation, setLastValidation] = useState<PredictionDataValidation | null>(null);

  useEffect(() => {
    fetchInsights();
  }, [profile?.company_id]);

  const fetchInsights = async () => {
    setIsLoading(true);
    if (!profile?.company_id) {
      setInsights([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("predictive_insights")
       .select("*")
      .eq("company_id", profile.company_id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching insights:", error);
    } else {
      setInsights((data ?? []) as unknown as PredictiveInsight[]);
    }
    setIsLoading(false);
  };

  const isDataSufficientForPrediction = (data: Array<{ created_at: string | null }>): PredictionDataValidation => {
    const validDates = data
      .map((item) => item.created_at)
      .filter((date): date is string => Boolean(date))
      .map((date) => new Date(date).getTime())
      .filter((timestamp) => Number.isFinite(timestamp));

    if (data.length < PREDICTION_MIN_RECORDS) {
      return {
        isSufficient: false,
        reason: `Se requieren al menos ${PREDICTION_MIN_RECORDS} incidencias reales para analizar patrones.`,
        recordCount: data.length,
        rangeDays: 0,
      };
    }

    if (validDates.length !== data.length) {
      return {
        isSufficient: false,
        reason: "Hay incidencias con fechas inválidas y no se puede ejecutar un análisis confiable.",
        recordCount: data.length,
        rangeDays: 0,
      };
    }

    const minDate = Math.min(...validDates);
    const maxDate = Math.max(...validDates);
    const rangeDays = Math.floor((maxDate - minDate) / (1000 * 60 * 60 * 24));

    if (rangeDays < PREDICTION_MIN_RANGE_DAYS) {
      return {
        isSufficient: false,
        reason: `Se requiere un histórico mínimo de ${PREDICTION_MIN_RANGE_DAYS} días para generar predicciones fiables.`,
        recordCount: data.length,
        rangeDays,
      };
    }

    return {
      isSufficient: true,
      recordCount: data.length,
      rangeDays,
    };
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
      const { data: incidentsData, error: incidentsError } = await supabase
        .from("incidencias")
        .select("id, incidencia_type, status, title, description, created_at, deadline")
        .eq("company_id", profile.company_id)
        .gte("created_at", new Date(Date.now() - PREDICTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (incidentsError) throw incidentsError;

      if (!incidentsData || incidentsData.length === 0) {
        const validation = {
          isSufficient: false,
          reason: `No hay incidencias reales registradas en los últimos ${PREDICTION_LOOKBACK_DAYS} días para la empresa.`,
          recordCount: 0,
          rangeDays: 0,
        } satisfies PredictionDataValidation;
        setLastValidation(validation);
        toast({
          title: "Sin datos para analizar",
          description: validation.reason,
          variant: "destructive",
        });
        return;
      }

      const validation = isDataSufficientForPrediction(incidentsData);
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
          rangeDays: validation.rangeDays,
          lookbackDays: PREDICTION_LOOKBACK_DAYS,
        });
      }

      const { error } = await supabase.functions.invoke("analyze-capa-patterns", {
        body: {
          companyId: profile.company_id,
          incidentsData,
        },
      });

      if (error) throw error;

      toast({
        title: "Análisis completado",
        description: "Se han detectado nuevos patrones e insights",
      });

      fetchInsights();
    } catch (e) {
      console.error("Error running analysis:", e);
      toast({
        title: "Error",
        description: "No se pudo ejecutar el análisis predictivo",
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
          read_at: new Date().toISOString(),
          read_by: userData.user?.id ?? null,
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

  const unreadInsights = insights.filter((i) => !i.read_at);
  const unacknowledgedCount = unreadInsights.length;
  const highSeverityCount = unreadInsights.filter((i) => i.severity === "high").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Análisis Predictivo de CAPAs</h2>
          <p className="text-sm text-muted-foreground">
            Detecta patrones y previene incidencias antes de que ocurran
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={isAnalyzing}>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <Brain className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{insights.length}</p>
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
      ) : insights.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">No hay datos suficientes para generar análisis predictivo.</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              {lastValidation?.reason ?? "Carga datos reales o completa el registro de incidencias para habilitar este módulo."}
            </p>
            <p className="text-xs text-muted-foreground mt-2 text-center max-w-md">
              Carga datos reales o completa los pasos de registro de incidencias, con al menos {PREDICTION_MIN_RECORDS} registros y {PREDICTION_MIN_RANGE_DAYS} días de histórico.
            </p>
            <Button className="mt-4" onClick={runAnalysis} disabled={isAnalyzing}>
              {isAnalyzing ? "Analizando..." : "Ejecutar Primer Análisis"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => {
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
