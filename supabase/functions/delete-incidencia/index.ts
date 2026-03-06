import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeleteIncidenciaPayload {
  incidenciaId?: string;
  confirmationText?: string;
}

const jsonResponse = (status: number, payload: { success: boolean; message: string }) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      success: false,
      message: "Método no permitido.",
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, {
        success: false,
        message: "Sesión no válida. Vuelva a iniciar sesión.",
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[delete-incidencia] Missing Supabase environment variables", {
        hasUrl: Boolean(SUPABASE_URL),
        hasAnonKey: Boolean(SUPABASE_ANON_KEY),
        hasServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      });
      return jsonResponse(500, {
        success: false,
        message: "Error interno al eliminar la incidencia.",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !caller) {
      return jsonResponse(401, {
        success: false,
        message: "Sesión no válida. Vuelva a iniciar sesión.",
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile, error: profileError } = await serviceClient
      .from("profiles")
      .select("is_superadmin,email")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (profileError) {
      console.error("[delete-incidencia] Failed loading caller profile", profileError);
      return jsonResponse(500, {
        success: false,
        message: "Error interno al eliminar la incidencia.",
      });
    }

    if (!callerProfile?.is_superadmin) {
      return jsonResponse(403, {
        success: false,
        message: "No autorizado: solo el Superadmin puede eliminar incidencias.",
      });
    }

    const { incidenciaId, confirmationText } = await req.json() as DeleteIncidenciaPayload;

    if (!incidenciaId) {
      return jsonResponse(400, {
        success: false,
        message: "Falta el identificador de la incidencia.",
      });
    }

    if (!isUuid(incidenciaId)) {
      return jsonResponse(400, {
        success: false,
        message: "El identificador de la incidencia no es válido.",
      });
    }

    if (confirmationText !== "ELIMINAR") {
      return jsonResponse(400, {
        success: false,
        message: "Confirmación inválida. Debe escribir ELIMINAR.",
      });
    }

    const { data: incident, error: incidentError } = await serviceClient
      .from("incidencias")
      .select("id,title")
      .eq("id", incidenciaId)
      .maybeSingle();

    if (incidentError) {
      console.error("[delete-incidencia] Failed loading incidencia", incidentError);
      return jsonResponse(500, {
        success: false,
        message: "Error interno al eliminar la incidencia.",
      });
    }

    if (!incident) {
      return jsonResponse(404, {
        success: false,
        message: "Incidencia no encontrada.",
      });
    }

    const [attachmentsCount, capaLinksCount] = await Promise.all([
      serviceClient
        .from("incidencia_attachments")
        .select("id", { count: "exact", head: true })
        .eq("incidencia_id", incidenciaId),
      serviceClient
        .from("incidencia_capa_plans")
        .select("incidencia_id", { count: "exact", head: true })
        .eq("incidencia_id", incidenciaId),
    ]);

    if (attachmentsCount.error || capaLinksCount.error) {
      console.error("[delete-incidencia] Dependency check failed", {
        attachmentsError: attachmentsCount.error,
        capaLinksError: capaLinksCount.error,
      });
      return jsonResponse(500, {
        success: false,
        message: "Error interno al eliminar la incidencia.",
      });
    }

    const hasDependencies = (attachmentsCount.count ?? 0) > 0 || (capaLinksCount.count ?? 0) > 0;

    if (hasDependencies) {
      return jsonResponse(409, {
        success: false,
        message: "No se puede eliminar la incidencia porque tiene registros relacionados.",
      });
    }

    const { error: deleteError } = await serviceClient
      .from("incidencias")
      .delete()
      .eq("id", incidenciaId);

    if (deleteError) {
      console.error("[delete-incidencia] Delete failed", deleteError);
      return jsonResponse(500, {
        success: false,
        message: "Error interno al eliminar la incidencia.",
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
      console.error("[delete-incidencia] Audit insert failed", auditError);
      return jsonResponse(500, {
        success: false,
        message: "Error interno al eliminar la incidencia.",
      });
    }

    return jsonResponse(200, {
      success: true,
      message: "Incidencia eliminada correctamente",
    });
  } catch (error) {
    console.error("[delete-incidencia] error", error);
    return jsonResponse(500, {
      success: false,
      message: "Error interno al eliminar la incidencia.",
    });
  }
});
