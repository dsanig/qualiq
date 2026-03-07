import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace("Bearer ", "")
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, message: "User not authenticated" }), { status: 401, headers: corsHeaders })
    }

    const userId = claimsData.claims.sub as string

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_superadmin")
      .eq("user_id", userId)
      .single()

    if (!profile || !profile.is_superadmin) {
      return new Response(JSON.stringify({ success: false, message: "Solo el Superadmin puede eliminar incidencias" }), { status: 403, headers: corsHeaders })
    }

    const { incidenciaId } = await req.json()
    if (!incidenciaId) {
      return new Response(JSON.stringify({ success: false, message: "Incidencia ID inválido" }), { status: 400, headers: corsHeaders })
    }

    await supabaseAdmin.from("incidencia_capa_plans").delete().eq("incidencia_id", incidenciaId)
    await supabaseAdmin.from("incidencia_attachments").delete().eq("incidencia_id", incidenciaId)

    const { error } = await supabaseAdmin.from("incidencias").delete().eq("id", incidenciaId)

    if (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true, message: "Incidencia eliminada correctamente" }), { headers: corsHeaders })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido"
    return new Response(JSON.stringify({ success: false, message }), { status: 500, headers: corsHeaders })
  }
})