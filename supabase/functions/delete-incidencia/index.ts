import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    const authHeader = req.headers.get("Authorization")

    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        message: "Unauthorized"
      }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({
        success: false,
        message: "User not authenticated"
      }), { status: 401, headers: corsHeaders })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "superadmin") {
      return new Response(JSON.stringify({
        success: false,
        message: "Solo el Superadmin puede eliminar incidencias"
      }), { status: 403, headers: corsHeaders })
    }

    const { incidenciaId } = await req.json()

    if (!incidenciaId) {
      return new Response(JSON.stringify({
        success: false,
        message: "Incidencia ID inválido"
      }), { status: 400, headers: corsHeaders })
    }

    const { error } = await supabase
      .from("incidencias")
      .delete()
      .eq("id", incidenciaId)

    if (error) {
      return new Response(JSON.stringify({
        success: false,
        message: error.message
      }), { status: 500, headers: corsHeaders })
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Incidencia eliminada correctamente"
    }), { headers: corsHeaders })

  } catch (err) {

    return new Response(JSON.stringify({
      success: false,
      message: err.message
    }), { status: 500, headers: corsHeaders })

  }

})
