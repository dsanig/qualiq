import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

type CreateUserPayload = {
  email: string;
  password: string;
  full_name?: string;
  roles?: string[];
  role?: string;
};

type CallerProfile = {
  id: string;
  email: string | null;
  is_superadmin: boolean;
};

type SuperadminDecision =
  | "profiles_by_id"
  | "profiles_by_email_fallback_aligned"
  | "profiles_by_email_fallback_bootstrapped"
  | "no_profile"
  | "false_flag"
  | "bootstrap_disabled"
  | "profile_lookup_error";

type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "NOT_SUPERADMIN"
  | "duplicate_email"
  | "invalid_email"
  | "weak_password"
  | "permission_denied"
  | "internal_error";

const ASSIGNABLE_ROLES = new Set(["Administrador", "Editor", "Espectador"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBUG_LOGS = Deno.env.get("DEBUG_USER_CREATION") === "true";
const INCLUDE_DEBUG_IN_RESPONSE = Deno.env.get("INCLUDE_DEBUG_IN_RESPONSE") === "true";
const BOOTSTRAP_SUPERADMIN = Deno.env.get("BOOTSTRAP_SUPERADMIN") === "true";
const ADMIN_BOOTSTRAP_EMAIL = "admin@admin.com";
const FUNCTION_NAME = "admin-create-user";
const FUNCTION_VERSION =
  Deno.env.get("FUNCTION_VERSION") ?? Deno.env.get("GIT_COMMIT_SHA") ?? Deno.env.get("DENO_DEPLOYMENT_ID") ?? "unknown";

const normalizeRole = (role: string) => {
  const normalized = role.trim().toLowerCase();
  if (normalized === "admin" || normalized === "administrador") {
    return "Administrador";
  }
  if (normalized === "editor") {
    return "Editor";
  }
  if (normalized === "viewer" || normalized === "espectador") {
    return "Espectador";
  }
  return role.trim();
};

const getHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

const decodeJwtClaims = (token: string): Record<string, unknown> | null => {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const logDiagnostic = (requestId: string, stage: string, data: Record<string, unknown>) => {
  if (!DEBUG_LOGS) return;
  console.info(JSON.stringify({ function: FUNCTION_NAME, requestId, stage, ...data }));
};

const buildErrorBody = (code: ErrorCode, message: string, details?: unknown, debug?: unknown) => {
  const body: {
    ok: false;
    error: {
      code: ErrorCode;
      message: string;
      details: unknown;
      debug?: unknown;
    };
  } = {
    ok: false,
    error: {
      code,
      message,
      details: details ?? null,
    },
  };

  if (INCLUDE_DEBUG_IN_RESPONSE && debug) {
    body.error.debug = debug;
  }

  return body;
};

const jsonResponse = (body: unknown, status: number, requestId: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
  });

const mapSupabaseAuthError = (message: string): { status: number; code: ErrorCode; message: string } => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("already exists")
  ) {
    return { status: 409, code: "duplicate_email", message: "El email ya existe." };
  }

  if (normalized.includes("invalid email")) {
    return { status: 400, code: "invalid_email", message: "El email no es válido." };
  }

  if (
    normalized.includes("password") &&
    (normalized.includes("weak") || normalized.includes("short") || normalized.includes("at least"))
  ) {
    return {
      status: 400,
      code: "weak_password",
      message: "La contraseña no cumple los requisitos de seguridad.",
    };
  }

  if (normalized.includes("not allowed") || normalized.includes("permission")) {
    return { status: 403, code: "permission_denied", message: "No tienes permisos para crear usuarios." };
  }

  return { status: 400, code: "bad_request", message: "No se pudo crear el usuario." };
};

serve(async (req) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "x-request-id": requestId },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(buildErrorBody("bad_request", "Método no permitido."), 405, requestId);
  }

  try {
    const authHeader = req.headers.get("authorization");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const functionProjectHost = getHostname(SUPABASE_URL);

    logDiagnostic(requestId, "env_fingerprint", {
      projectHost: functionProjectHost,
      functionVersion: FUNCTION_VERSION,
      debugEnabled: DEBUG_LOGS,
      includeDebugInResponse: INCLUDE_DEBUG_IN_RESPONSE,
    });

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        buildErrorBody("internal_error", "Variables de entorno de Supabase incompletas."),
        500,
        requestId,
      );
    }

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(buildErrorBody("unauthorized", "No autorizado."), 401, requestId);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const tokenClaims = decodeJwtClaims(token);
    const tokenIss = typeof tokenClaims?.iss === "string" ? tokenClaims.iss : null;
    const tokenProjectHost = tokenIss ? getHostname(tokenIss) : null;

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await anonClient.auth.getUser(token);

    logDiagnostic(requestId, "auth_and_caller", {
      hasAuthHeader: Boolean(authHeader),
      callerId: caller?.id ?? null,
      callerEmail: caller?.email ?? null,
      tokenSub: tokenClaims?.sub ?? null,
      tokenEmail: tokenClaims?.email ?? null,
      tokenProjectHost,
      authError: authError?.message ?? null,
    });

    if (authError || !caller) {
      return jsonResponse(buildErrorBody("unauthorized", "Token inválido o expirado."), 401, requestId);
    }

    const countProbe = await serviceClient.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    logDiagnostic(requestId, "db_probe", {
      profilesCount: countProbe.count ?? null,
      error: countProbe.error?.message ?? null,
    });

    const normalizedCallerEmail = caller.email?.trim().toLowerCase() ?? null;

    const byIdResult = await serviceClient
      .from("profiles")
      .select("id, email, is_superadmin")
      .eq("id", caller.id)
      .maybeSingle<CallerProfile>();

    const byEmailResult = normalizedCallerEmail
      ? await serviceClient
          .from("profiles")
          .select("id, email, is_superadmin")
          .ilike("email", normalizedCallerEmail)
          .maybeSingle<CallerProfile>()
      : { data: null, error: null };

    let callerProfile = byIdResult.data ?? null;
    let decision: SuperadminDecision = "no_profile";

    const canBootstrapAdmin = BOOTSTRAP_SUPERADMIN && normalizedCallerEmail === ADMIN_BOOTSTRAP_EMAIL;

    if (byIdResult.error || byEmailResult.error) {
      decision = "profile_lookup_error";
    } else if (callerProfile?.is_superadmin) {
      decision = "profiles_by_id";
    } else if (callerProfile && !callerProfile.is_superadmin) {
      decision = "false_flag";
    } else if (byEmailResult.data?.is_superadmin) {
      if (canBootstrapAdmin) {
        const alignResult = await serviceClient.from("profiles").upsert(
          {
            id: caller.id,
            email: normalizedCallerEmail,
            full_name: caller.user_metadata?.full_name ?? caller.user_metadata?.name ?? null,
            is_superadmin: true,
          },
          { onConflict: "id" },
        ).select("id, email, is_superadmin").maybeSingle<CallerProfile>();

        callerProfile = alignResult.data ?? null;
        decision = alignResult.error
          ? "profile_lookup_error"
          : byEmailResult.data.id === caller.id
          ? "profiles_by_email_fallback_aligned"
          : "profiles_by_email_fallback_bootstrapped";
      } else {
        decision = "bootstrap_disabled";
      }
    }

    const debugPayload = {
      requestId,
      callerId: caller.id,
      callerEmail: normalizedCallerEmail,
      profileById: byIdResult.data ?? null,
      profileByEmail: byEmailResult.data ?? null,
      byIdError: byIdResult.error?.message ?? null,
      byEmailError: byEmailResult.error?.message ?? null,
      decision,
      projectHost: functionProjectHost,
    };

    logDiagnostic(requestId, "superadmin_check", debugPayload);

    if (decision === "profile_lookup_error") {
      return jsonResponse(
        buildErrorBody("internal_error", "No se pudo validar el perfil del solicitante.", null, debugPayload),
        500,
        requestId,
      );
    }

    if (!callerProfile?.is_superadmin) {
      return jsonResponse(
        buildErrorBody("NOT_SUPERADMIN", "Solo el superadministrador puede gestionar usuarios.", null, debugPayload),
        403,
        requestId,
      );
    }

    const payload = (await req.json()) as CreateUserPayload;
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password?.trim();
    const fullName = payload.full_name?.trim() ?? null;
    const requestedRoles = payload.roles ?? (payload.role ? [payload.role] : []);

    if (!email || !password || password.length < 8) {
      return jsonResponse(
        buildErrorBody("bad_request", "Email y contraseña válida (mínimo 8 caracteres) son obligatorios."),
        400,
        requestId,
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return jsonResponse(buildErrorBody("invalid_email", "El email no es válido."), 400, requestId);
    }

    if (requestedRoles.length === 0) {
      return jsonResponse(buildErrorBody("bad_request", "Debes indicar al menos un rol."), 400, requestId);
    }

    const normalizedRoles = [...new Set(requestedRoles.map((role) => normalizeRole(role)).filter(Boolean))];

    if (normalizedRoles.length === 0 || normalizedRoles.some((role) => !ASSIGNABLE_ROLES.has(role))) {
      return jsonResponse(
        buildErrorBody("bad_request", "Roles inválidos. Solo se permiten: Administrador, Editor y Espectador."),
        400,
        requestId,
      );
    }

    const { data: createdUserData, error: createUserError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createUserError || !createdUserData.user) {
      const mapped = mapSupabaseAuthError(createUserError?.message ?? "No se pudo crear el usuario.");
      return jsonResponse(
        buildErrorBody(mapped.code, mapped.message, { supabaseMessage: createUserError?.message ?? null }),
        mapped.status,
        requestId,
      );
    }

    const newUserId = createdUserData.user.id;
    const { error: profileUpsertError } = await serviceClient.from("profiles").upsert(
      {
        id: newUserId,
        email,
        full_name: fullName,
        is_superadmin: false,
      },
      { onConflict: "id" },
    );

    if (profileUpsertError) {
      await serviceClient.auth.admin.deleteUser(newUserId);
      return jsonResponse(
        buildErrorBody("internal_error", "No se pudo crear el perfil del usuario.", {
          supabaseMessage: profileUpsertError.message,
        }),
        500,
        requestId,
      );
    }

    const roleRows = normalizedRoles.map((role) => ({ user_id: newUserId, role }));
    const { error: rolesError } = await serviceClient.from("user_roles").upsert(roleRows, {
      onConflict: "user_id,role",
    });

    if (rolesError) {
      await serviceClient.auth.admin.deleteUser(newUserId);
      await serviceClient.from("profiles").delete().eq("id", newUserId);
      return jsonResponse(
        buildErrorBody("bad_request", "No se pudieron asignar los roles.", {
          supabaseMessage: rolesError.message,
        }),
        400,
        requestId,
      );
    }

    return jsonResponse(
      {
        ok: true,
        userId: newUserId,
        email,
        ...(INCLUDE_DEBUG_IN_RESPONSE ? { debug: { requestId, decision, projectHost: functionProjectHost } } : {}),
      },
      201,
      requestId,
    );
  } catch (error) {
    console.error(JSON.stringify({ function: FUNCTION_NAME, requestId, stage: "exception", error: error instanceof Error ? error.message : error }));
    return jsonResponse(
      buildErrorBody("internal_error", error instanceof Error ? error.message : "Error interno."),
      500,
      requestId,
    );
  }
});
