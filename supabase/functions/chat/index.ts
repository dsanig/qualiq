import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_SYSTEM_PROMPT = `Eres el Asistente de Cumplimiento IA de QualiQ.

Reglas obligatorias:
- Responde siempre en español.
- Usa EXCLUSIVAMENTE el contexto real entregado por el sistema y normativa aplicable.
- No inventes datos ni uses ejemplos demo.
- Si falta información, dilo claramente.
- Mantén tono profesional, concreto y útil.
- Nunca des asesoría legal definitiva; recomienda validar con el equipo regulatorio.`;

const truncate = (value: string | null | undefined, size = 220) => {
  if (!value) return "";
  return value.length > size ? `${value.slice(0, size)}…` : value;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado. Se requiere autenticación." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !LOVABLE_API_KEY) {
      throw new Error("Faltan variables de entorno requeridas para chat.");
    }

    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido o expirado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.company_id) {
      return new Response(JSON.stringify({ error: "Perfil de usuario sin empresa asociada." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = profile.company_id;

    const [documentsRes, incidentsRes, auditsRes] = await Promise.all([
      adminSupabase
        .from("documents")
        .select("code,title,status,category,version,updated_at")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(20),
      adminSupabase
        .from("incidencias")
        .select("incidencia_type,title,status,description,created_at,deadline")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
      adminSupabase
        .from("audits")
        .select("audit_type,status,auditor_id,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const documents = documentsRes.data ?? [];
    const incidents = incidentsRes.data ?? [];
    const audits = auditsRes.data ?? [];

    const documentsContext = documents
      .map((d) => `- [${d.status}] ${d.code} v${d.version}: ${truncate(d.title, 120)} (${d.category})`)
      .join("\n") || "- Sin documentos registrados";

    const incidentsContext = incidents
      .map((i) => `- [${i.status}] ${i.incidencia_type}: ${truncate(i.title, 100)} | ${truncate(i.description, 140)}`)
      .join("\n") || "- Sin incidencias registradas";

    const auditsContext = audits
      .map((a) => `- [${a.status}] ${a.audit_type} (${a.created_at})`)
      .join("\n") || "- Sin auditorías registradas";

    const systemPrompt = `${BASE_SYSTEM_PROMPT}

Contexto REAL de la empresa (company_id=${companyId}):

Documentación (últimos ${documents.length}):
${documentsContext}

Incidencias (últimas ${incidents.length}):
${incidentsContext}

Auditorías (últimas ${audits.length}):
${auditsContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        const message = response.status === 429
          ? "Límite de consultas excedido. Por favor, inténtelo más tarde."
          : "Se requiere añadir créditos para continuar usando el asistente IA.";
        return new Response(JSON.stringify({ error: message }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Error del servicio de IA. Por favor, inténtelo de nuevo." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
