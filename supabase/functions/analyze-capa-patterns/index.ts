import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const PREDICTION_MIN_RECORDS = 1;

function validateIncidentsForPrediction(incidentsData: Array<{ created_at?: string | null }>, minRecords: number) {
  if (incidentsData.length < minRecords) {
    return {
      ok: false,
      reason: `Se requieren al menos ${minRecords} incidencias reales para ejecutar el análisis predictivo.`,
    };
  }

  const timestamps = incidentsData
    .map((incident) => incident.created_at)
    .filter((date): date is string => Boolean(date))
    .map((date) => new Date(date).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length === 0) {
    return {
      ok: false,
      reason: "Existen incidencias con fechas inválidas; no se puede ejecutar el análisis predictivo.",
    };
  }

  const minDate = Math.min(...timestamps);
  const maxDate = Math.max(...timestamps);
  const rangeDays = Math.floor((maxDate - minDate) / (1000 * 60 * 60 * 24));

  return {
    ok: true,
    rangeDays,
    records: incidentsData.length,
  };
}

const SYSTEM_PROMPT = `Eres un experto en análisis predictivo para gestión de calidad en el sector farmacéutico y sanitario.

Tu rol es detectar patrones en datos históricos de incidencias, desviaciones y CAPAs para predecir y prevenir problemas futuros.

TIPOS DE PATRONES A DETECTAR:
1. Correlaciones temporales (estacionalidad, turnos, días de la semana)
2. Correlaciones de personal (rotación, formación, experiencia)
3. Correlaciones de equipo/línea de producción
4. Tendencias crecientes o decrecientes
5. Clusters de incidencias por área o proceso

IMPORTANTE:
- Proporciona insights accionables, no solo estadísticas
- Sugiere acciones preventivas concretas
- Indica nivel de confianza en cada insight
- Usa lenguaje profesional en español`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado. Se requiere autenticación." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    // Create client with user's token to verify authentication
    const userSupabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Token inválido o expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("CAPA pattern analysis request authenticated for user:", user.id);

    const { companyId, incidentsData, analysisWindow } = await req.json();

    // Determine minimum records based on the selected analysis window
    const windowMinRecords: Record<string, number> = {
      current: 1, "1w": 1, "2w": 1, "1m": 1, "3m": 1, "6m": 1, "1y": 1,
    };
    const minRecords = windowMinRecords[analysisWindow] ?? PREDICTION_MIN_RECORDS;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use service role client for database operations
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify user belongs to the requested company
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Perfil de usuario no encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.company_id !== companyId) {
      return new Response(
        JSON.stringify({ error: "No tiene permiso para analizar datos de esta empresa." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Analyzing CAPA patterns for company:", companyId);

    if (!Array.isArray(incidentsData) || incidentsData.length === 0) {
      return new Response(
        JSON.stringify({ error: "No hay incidencias reales disponibles para analizar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validateIncidentsForPrediction(incidentsData, minRecords);
    if (!validation.ok) {
      return new Response(
        JSON.stringify({ error: validation.reason }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Predictive analysis source=incidencias records=", validation.records, "rangeDays=", validation.rangeDays);

    // Format incidents data for analysis
    const incidentsContext = JSON.stringify(incidentsData, null, 2);

    const userPrompt = `Analiza los siguientes datos de incidencias y detecta patrones predictivos:

DATOS DE INCIDENCIAS:
${incidentsContext}

Responde en formato JSON con esta estructura:
{
  "insights": [
    {
      "insight_type": "pattern|trend|risk|recommendation",
      "severity": "high|medium|low",
      "title": "Título del insight",
      "description": "Descripción detallada del patrón detectado",
      "pattern_details": {
        "type": "shift_correlation|seasonal|equipment|personnel|process",
        "correlation_strength": 0.85,
        "data_points_analyzed": 15
      },
      "affected_areas": ["Línea 4", "Turno B"],
      "suggested_actions": [
        "Acción preventiva 1",
        "Acción preventiva 2"
      ],
      "confidence_score": 85
    }
  ]
}

Genera entre 2 y 5 insights relevantes basados en los patrones detectados.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("AI response received, parsing insights...");

    const parsed = JSON.parse(content);
    const insights = parsed.insights || [];

    // Replace previous results so each run reflects only the latest real-data analysis
    const { error: deleteInsightsError } = await supabase
      .from("predictive_insights")
      .delete()
      .eq("company_id", companyId);

    if (deleteInsightsError) {
      console.error("Error deleting previous insights:", deleteInsightsError);
      throw new Error("No se pudieron limpiar los insights anteriores");
    }

    const sourceIncidentIds = incidentsData.map((incident: { id?: string }) => incident.id).filter(Boolean);

    // Insert insights and pattern detections
    for (const insight of insights) {
      const { data: insightData, error: insightError } = await supabase
        .from("predictive_insights")
        .insert({
          company_id: companyId,
          insight_type: insight.insight_type,
          severity: insight.severity,
          title: insight.title,
          description: insight.description,
          pattern_details: insight.pattern_details,
          affected_areas: insight.affected_areas,
          suggested_actions: insight.suggested_actions,
          confidence_score: insight.confidence_score,
          source: {
            generated_from: "incidencias",
            lookback_days: 90,
            incident_ids: sourceIncidentIds,
          },
        })
        .select()
        .single();

      if (insightError) {
        console.error("Error inserting insight:", insightError);
        continue;
      }

      if (insight.pattern_details) {
        await supabase.from("pattern_detections").insert({
          company_id: companyId,
          insight_id: insightData.id,
          pattern_type: insight.pattern_details.type,
          data_points: { analyzed: insight.pattern_details.data_points_analyzed },
          correlation_strength: insight.pattern_details.correlation_strength,
        });
      }
    }

    console.log("CAPA pattern analysis completed with", insights.length, "insights");

    return new Response(
      JSON.stringify({ success: true, insightsCount: insights.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("CAPA pattern analysis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
