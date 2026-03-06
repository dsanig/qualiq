import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteIncidenciaPayload {
  incidenciaId?: string;
  confirmationText?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variables de entorno de Supabase incompletas.");
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Token inválido o expirado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile } = await serviceClient
      .from("profiles")
      .select("is_superadmin,email")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!callerProfile?.is_superadmin) {
      return new Response(JSON.stringify({ error: "No autorizado: solo el Superadmin puede eliminar incidencias." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { incidenciaId, confirmationText } = await req.json() as DeleteIncidenciaPayload;

    if (!incidenciaId) {
      return new Response(JSON.stringify({ error: "incidenciaId es obligatorio." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (confirmationText !== "ELIMINAR") {
      return new Response(JSON.stringify({ error: "Confirmación inválida. Debe escribir ELIMINAR." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: incident, error: incidentError } = await serviceClient
      .from("incidencias")
      .select("id,title")
      .eq("id", incidenciaId)
      .maybeSingle();

    if (incidentError) {
      return new Response(JSON.stringify({ error: incidentError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!incident) {
      return new Response(JSON.stringify({ error: "Incidencia no encontrada." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [attachmentsCount, capaLinksCount] = await Promise.all([
      serviceClient.from("incidencia_attachments").select("id", { count: "exact", head: true }).eq("incidencia_id", incidenciaId),
      serviceClient.from("incidencia_capa_plans").select("incidencia_id", { count: "exact", head: true }).eq("incidencia_id", incidenciaId),
    ]);

    if (attachmentsCount.error || capaLinksCount.error) {
      return new Response(JSON.stringify({ error: attachmentsCount.error?.message ?? capaLinksCount.error?.message ?? "No se pudo validar dependencias." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasDependencies = (attachmentsCount.count ?? 0) > 0 || (capaLinksCount.count ?? 0) > 0;

    if (hasDependencies) {
      return new Response(JSON.stringify({ error: "No se puede eliminar la incidencia porque tiene registros relacionados." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: deleteError } = await serviceClient
      .from("incidencias")
      .delete()
      .eq("id", incidenciaId);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: auditError } = await serviceClient
      .from("incidencia_deletion_audit")
      .insert({
        action: "delete_incidencia",
        incidencia_id: incident.id,
        incidencia_title: incident.title,
        deleted_by_user_id: caller.id,
        deleted_by_email: callerProfile.email ?? caller.email ?? null,
        description: `El Superadmin eliminó la incidencia "${incident.title}"`,
      });

    if (auditError) {
      return new Response(JSON.stringify({ error: auditError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[delete-incidencia] error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error interno." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
