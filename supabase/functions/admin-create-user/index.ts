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

type Decision =
  | "MISSING_AUTH"
  | "INVALID_TOKEN"
  | "TOKEN_RUNTIME_MISMATCH"
  | "ENV_INCOMPLETE"
  | "PROFILE_BY_ID_MISSING"
  | "PROFILE_BY_ID_SUPERADMIN_FALSE"
  | "PROFILE_BY_ID_SUPERADMIN_TRUE"
  | "PROFILE_EMAIL_FALLBACK_SUPERADMIN_TRUE"
  | "PROFILE_EMAIL_FALLBACK_NOT_ALLOWED"
  | "PROFILE_AMBIGUOUS_EMAIL"
  | "PROJECT_ENV_MISMATCH_SUSPECTED"
  | "UNKNOWN_DENIAL";

const ASSIGNABLE_ROLES = new Set(["Administrador", "Editor", "Espectador"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBUG_LOGS = Deno.env.get("DEBUG_USER_CREATION") === "true";
const INCLUDE_DEBUG_IN_RESPONSE = Deno.env.get("INCLUDE_DEBUG_IN_RESPONSE") === "true";
const BOOTSTRAP_SUPERADMIN = Deno.env.get("BOOTSTRAP_SUPERADMIN") === "true";
const BOOTSTRAP_ALIGN_PROFILE_ID = Deno.env.get("BOOTSTRAP_ALIGN_PROFILE_ID") === "true";
const ADMIN_BOOTSTRAP_EMAIL = "admin@admin.com";
const FUNCTION_NAME = "admin-create-user";
const FUNCTION_VERSION = "admin-create-user@diag-2";

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

const normalizeEmail = (value: string | null | undefined): string | null => value?.trim().toLowerCase() ?? null;

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
  console.info(JSON.stringify({ function: FUNCTION_NAME, functionVersion: FUNCTION_VERSION, requestId, stage, ...data }));
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

  if (DEBUG_LOGS && INCLUDE_DEBUG_IN_RESPONSE && debug) {
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
    const authHeaderPrefixOk = Boolean(authHeader?.startsWith("Bearer "));
    const hasAuthHeader = Boolean(authHeader);
    const originHeader = req.headers.get("origin");
    const clientProvidedHost = originHeader ? getHostname(originHeader) : null;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const functionProjectHost = getHostname(SUPABASE_URL);

    logDiagnostic(requestId, "request_received", {
      hasAuthHeader,
      authHeaderPrefixOk,
      projectHost: functionProjectHost,
      clientProvidedHost,
      debugEnabled: DEBUG_LOGS,
      includeDebugInResponse: INCLUDE_DEBUG_IN_RESPONSE,
    });

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      const decision: Decision = "ENV_INCOMPLETE";
      const debugPayload = {
        functionVersion: FUNCTION_VERSION,
        requestId,
        decision,
        projectHost: functionProjectHost,
        clientProvidedHost,
      };
      logDiagnostic(requestId, "deny", debugPayload);
      return jsonResponse(
        buildErrorBody("internal_error", "Variables de entorno de Supabase incompletas.", null, debugPayload),
        500,
        requestId,
      );
    }

    if (!hasAuthHeader) {
      const decision: Decision = "MISSING_AUTH";
      const debugPayload = {
        functionVersion: FUNCTION_VERSION,
        requestId,
        decision,
        hasAuthHeader,
        authHeaderPrefixOk,
        projectHost: functionProjectHost,
        clientProvidedHost,
      };
      logDiagnostic(requestId, "deny", debugPayload);
      return jsonResponse(buildErrorBody("unauthorized", "No autorizado.", null, debugPayload), 401, requestId);
    }

    if (!authHeaderPrefixOk) {
      const decision: Decision = "INVALID_TOKEN";
      const debugPayload = {
        functionVersion: FUNCTION_VERSION,
        requestId,
        decision,
        hasAuthHeader,
        authHeaderPrefixOk,
        projectHost: functionProjectHost,
        clientProvidedHost,
      };
      logDiagnostic(requestId, "deny", debugPayload);
      return jsonResponse(buildErrorBody("unauthorized", "Token inválido o expirado.", null, debugPayload), 401, requestId);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const tokenClaims = decodeJwtClaims(token);
    const tokenSub = typeof tokenClaims?.sub === "string" ? tokenClaims.sub : null;
    const tokenEmail = normalizeEmail(typeof tokenClaims?.email === "string" ? tokenClaims.email : null);
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

    const callerEmail = normalizeEmail(caller?.email ?? null);
    const tokenSubMatchesCaller = Boolean(tokenSub && caller?.id && tokenSub === caller.id);
    const tokenEmailMatchesCaller = Boolean(tokenEmail && callerEmail && tokenEmail === callerEmail);

    logDiagnostic(requestId, "auth_pipeline", {
      hasAuthHeader,
      authHeaderPrefixOk,
      tokenClaims: {
        sub: tokenSub,
        email: tokenEmail,
      },
      callerId: caller?.id ?? null,
      callerEmail,
      tokenSubMatchesCaller,
      tokenEmailMatchesCaller,
      tokenProjectHost,
      authError: authError?.message ?? null,
    });

    if (authError || !caller) {
      const decision: Decision = "INVALID_TOKEN";
      const debugPayload = {
        functionVersion: FUNCTION_VERSION,
        requestId,
        decision,
        projectHost: functionProjectHost,
        clientProvidedHost,
        hasAuthHeader,
        authHeaderPrefixOk,
        tokenClaims: { sub: tokenSub, email: tokenEmail },
        callerId: null,
        callerEmail: null,
        tokenSubMatchesCaller,
        tokenEmailMatchesCaller,
      };
      logDiagnostic(requestId, "deny", debugPayload);
      return jsonResponse(buildErrorBody("unauthorized", "Token inválido o expirado.", null, debugPayload), 401, requestId);
    }

    if ((tokenSub && !tokenSubMatchesCaller) || (tokenEmail && !tokenEmailMatchesCaller)) {
      const decision: Decision = "TOKEN_RUNTIME_MISMATCH";
      const debugPayload = {
        functionVersion: FUNCTION_VERSION,
        requestId,
        decision,
        projectHost: functionProjectHost,
        clientProvidedHost,
        hasAuthHeader,
        authHeaderPrefixOk,
        tokenClaims: { sub: tokenSub, email: tokenEmail },
        callerId: caller.id,
        callerEmail,
        tokenSubMatchesCaller,
        tokenEmailMatchesCaller,
      };
      logDiagnostic(requestId, "deny", debugPayload);
      return jsonResponse(buildErrorBody("unauthorized", "Token inválido o inconsistente.", null, debugPayload), 401, requestId);
    }

    const byIdResult = await serviceClient
      .from("profiles")
      .select("id, email, is_superadmin")
      .eq("id", caller.id)
      .maybeSingle<CallerProfile>();

    const byEmailResult = callerEmail
      ? await serviceClient
          .from("profiles")
          .select("id, email, is_superadmin")
          .ilike("email", callerEmail)
          .maybeSingle<CallerProfile>()
      : { data: null, error: null };

    const emailCountResult = callerEmail
      ? await serviceClient.from("profiles").select("id", { count: "exact", head: true }).ilike("email", callerEmail)
      : { count: 0, error: null };

    const profileByIdFound = Boolean(byIdResult.data);
    const profileByEmailFound = Boolean(byEmailResult.data);
    const profileByIdSuperadmin = byIdResult.data?.is_superadmin ?? null;
    const profileByEmailSuperadmin = byEmailResult.data?.is_superadmin ?? null;
    const profileEmailCount = emailCountResult.count ?? 0;

    let decision: Decision = "UNKNOWN_DENIAL";

    if (byIdResult.error || byEmailResult.error || emailCountResult.error) {
      decision = "UNKNOWN_DENIAL";
    } else if (tokenProjectHost && functionProjectHost && tokenProjectHost !== functionProjectHost) {
      decision = "PROJECT_ENV_MISMATCH_SUSPECTED";
    } else if (byIdResult.data?.is_superadmin) {
      decision = "PROFILE_BY_ID_SUPERADMIN_TRUE";
    } else if (profileByIdFound && !byIdResult.data?.is_superadmin) {
      decision = "PROFILE_BY_ID_SUPERADMIN_FALSE";
    } else if (!profileByIdFound && profileEmailCount > 1) {
      decision = "PROFILE_AMBIGUOUS_EMAIL";
    } else if (!profileByIdFound && byEmailResult.data?.is_superadmin) {
      decision = "PROFILE_EMAIL_FALLBACK_SUPERADMIN_TRUE";
    } else if (!profileByIdFound) {
      decision = "PROFILE_BY_ID_MISSING";
    }

    let callerProfile = byIdResult.data ?? null;
    const canRecoveryBootstrap = BOOTSTRAP_SUPERADMIN && callerEmail === ADMIN_BOOTSTRAP_EMAIL;

    if (!callerProfile?.is_superadmin && decision === "PROFILE_EMAIL_FALLBACK_SUPERADMIN_TRUE") {
      if (profileEmailCount > 1) {
        decision = "PROFILE_AMBIGUOUS_EMAIL";
      } else {
        callerProfile = byEmailResult.data;
        if (BOOTSTRAP_ALIGN_PROFILE_ID) {
          const alignResult = await serviceClient.from("profiles").upsert(
            {
              id: caller.id,
              email: callerEmail,
              full_name: caller.user_metadata?.full_name ?? caller.user_metadata?.name ?? null,
              is_superadmin: true,
            },
            { onConflict: "id" },
          );

          if (alignResult.error) {
            decision = "UNKNOWN_DENIAL";
          }
        }
      }
    }

    if (!callerProfile?.is_superadmin && canRecoveryBootstrap && decision !== "PROFILE_AMBIGUOUS_EMAIL") {
      const bootstrapResult = await serviceClient.from("profiles").upsert(
        {
          id: caller.id,
          email: callerEmail,
          full_name: caller.user_metadata?.full_name ?? caller.user_metadata?.name ?? null,
          is_superadmin: true,
        },
        { onConflict: "id" },
      ).select("id, email, is_superadmin").maybeSingle<CallerProfile>();

      if (!bootstrapResult.error && bootstrapResult.data?.is_superadmin) {
        callerProfile = bootstrapResult.data;
        decision = "PROFILE_EMAIL_FALLBACK_SUPERADMIN_TRUE";
      }
    }

    if (
      decision === "PROFILE_BY_ID_MISSING" &&
      (!profileByEmailFound || !profileByEmailSuperadmin)
    ) {
      decision = "PROFILE_EMAIL_FALLBACK_NOT_ALLOWED";
    }

    const debugPayload = {
      functionVersion: FUNCTION_VERSION,
      requestId,
      decision,
      projectHost: functionProjectHost,
      clientProvidedHost,
      tokenProjectHost,
      hasAuthHeader,
      authHeaderPrefixOk,
      tokenClaims: {
        sub: tokenSub,
        email: tokenEmail,
      },
      callerId: caller.id,
      callerEmail,
      tokenSubMatchesCaller,
      tokenEmailMatchesCaller,
      profileByIdFound,
      profileByEmailFound,
      profileByIdSuperadmin,
      profileByEmailSuperadmin,
      profileEmailCount,
      profileById: byIdResult.data ?? null,
      profileByEmail: byEmailResult.data ?? null,
      byIdError: byIdResult.error?.message ?? null,
      byEmailError: byEmailResult.error?.message ?? null,
      byEmailCountError: emailCountResult.error?.message ?? null,
    };

    logDiagnostic(requestId, "superadmin_authorization", debugPayload);

    if (decision === "PROFILE_AMBIGUOUS_EMAIL") {
      return jsonResponse(
        buildErrorBody("internal_error", "Ambigüedad: email duplicado en profiles. Contacta soporte.", null, debugPayload),
        500,
        requestId,
      );
    }

    if (decision === "PROJECT_ENV_MISMATCH_SUSPECTED") {
      return jsonResponse(
        buildErrorBody("NOT_SUPERADMIN", "Solo el superadministrador puede gestionar usuarios.", null, debugPayload),
        403,
        requestId,
      );
    }

    if (byIdResult.error || byEmailResult.error || emailCountResult.error) {
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
        ...(DEBUG_LOGS && INCLUDE_DEBUG_IN_RESPONSE
          ? {
              debug: {
                functionVersion: FUNCTION_VERSION,
                requestId,
                decision,
                projectHost: functionProjectHost,
                clientProvidedHost,
              },
            }
          : {}),
      },
      201,
      requestId,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        function: FUNCTION_NAME,
        functionVersion: FUNCTION_VERSION,
        requestId,
        stage: "exception",
        error: error instanceof Error ? error.message : error,
      }),
    );
    return jsonResponse(
      buildErrorBody("internal_error", error instanceof Error ? error.message : "Error interno."),
      500,
      requestId,
    );
  }
});
