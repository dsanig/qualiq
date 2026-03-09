import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  confirmation_text?: string;
  password?: string;
};

type ErrorCode =
  | "INVALID_CONFIRMATION_TEXT"
  | "PASSWORD_REQUIRED"
  | "AUTH_CONTEXT_MISSING"
  | "AUTH_USER_UNAVAILABLE"
  | "PASSWORD_INVALID"
  | "IDENTITY_VERIFICATION_FAILED"
  | "INTERNAL_ERROR";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const errorResponse = (status: number, code: ErrorCode, message: string) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: jsonHeaders,
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "INTERNAL_ERROR", "Método no permitido.");
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(401, "AUTH_CONTEXT_MISSING", "No se pudo verificar la sesión actual.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey) {
      console.error("[verify-signature-confirmation] missing Supabase environment configuration", {
        hasUrl: Boolean(supabaseUrl),
        hasAnonOrServiceRole: Boolean(anonKey),
      });
      return errorResponse(500, "INTERNAL_ERROR", "La validación de firma no está disponible temporalmente.");
    }

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const confirmationText = payload.confirmation_text ?? "";
    const password = payload.password ?? "";

    if (confirmationText !== "FIRMAR") {
      return errorResponse(400, "INVALID_CONFIRMATION_TEXT", "Debe escribir exactamente FIRMAR.");
    }

    if (!password) {
      return errorResponse(400, "PASSWORD_REQUIRED", "Debe introducir su contraseña actual.");
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user?.email) {
      console.error("[verify-signature-confirmation] auth user unavailable", {
        userError: userError?.message,
        hasUser: Boolean(user),
        hasEmail: Boolean(user?.email),
      });
      return errorResponse(401, "AUTH_USER_UNAVAILABLE", "No se pudo verificar la identidad del usuario actual.");
    }

    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (verifyError) {
      console.warn("[verify-signature-confirmation] credential verification failed", {
        userId: user.id,
        email: user.email,
        authError: verifyError.message,
      });
      return errorResponse(401, "PASSWORD_INVALID", "La contraseña introducida no es correcta.");
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("[verify-signature-confirmation] unexpected error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(500, "IDENTITY_VERIFICATION_FAILED", "No se pudo validar la confirmación de firma.");
  }
});
