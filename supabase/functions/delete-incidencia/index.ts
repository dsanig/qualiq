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
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      console.error("Auth error:", userError?.message ?? "no user")
      return new Response(JSON.stringify({ success: false, message: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const userId = user.id
    console.log("Authenticated user:", userId)

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_superadmin")
      .eq("user_id", userId)
      .single()

    console.log("Profile lookup:", JSON.stringify({ profile, error: profileError?.message }))

    if (profileError || !profile || !profile.is_superadmin) {
      return new Response(JSON.stringify({ success: false, message: "Solo el Superadmin puede eliminar incidencias" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { incidenciaId } = await req.json()
    if (!incidenciaId) {
      return new Response(JSON.stringify({ success: false, message: "Incidencia ID inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    console.log("Deleting incidencia:", incidenciaId)

    await supabaseAdmin.from("incidencia_capa_plans").delete().eq("incidencia_id", incidenciaId)
    await supabaseAdmin.from("incidencia_attachments").delete().eq("incidencia_id", incidenciaId)

    const { error: deleteError } = await supabaseAdmin.from("incidencias").delete().eq("id", incidenciaId)

    if (deleteError) {
      console.error("Delete error:", deleteError.message)
      return new Response(JSON.stringify({ success: false, message: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    console.log("Incidencia deleted successfully")
    return new Response(JSON.stringify({ success: true, message: "Incidencia eliminada correctamente" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido"
    console.error("Unhandled error:", message)
    return new Response(JSON.stringify({ success: false, message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})