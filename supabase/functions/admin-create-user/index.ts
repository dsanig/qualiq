import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_VERSION = "admin-create-user@authdiag-001";
const FUNCTION_NAME = "admin-create-user";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Expose-Headers": "x-request-id, x-function-version, x-debug-decision, x-debug-caller-email, x-debug-caller-id",
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

type Decision =
  | "NOT_SUPERADMIN_BY_ID"
  | "NOT_SUPERADMIN_BY_EMAIL"
  | "PROFILE_MISSING"
  | "PROFILE_SUPERADMIN_FALSE"
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "ENV_MISMATCH_SUSPECTED"
  | "UNKNOWN";

type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "duplicate_email"
  | "invalid_email"
  | "weak_password"
  | "permission_denied"
  | "internal_error";

type DebugPayload = {
  requestId: string;
  functionVersion: string;
  decision: Decision | "NOT_SUPERADMIN_BY_ID_BUT_EMAIL_SUPERADMIN_TRUE";
  callerId: string | null;
  callerEmail: string | null;
  profileById: CallerProfile | null;
  profileByEmail: CallerProfile | null;
  profileByEmailCount: number | null;
  hasUniqueLowerEmailIndex: boolean | null;
  tokenProjectHost: string | null;
  functionProjectHost: string | null;
  alignedProfileId: boolean;
  errors: string[];
};

const ASSIGNABLE_ROLES = new Set(["Administrador", "Editor", "Espectador"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBUG_LOGS = Deno.env.get("DEBUG_USER_CREATION") === "true";
const INCLUDE_DEBUG_IN_RESPONSE = Deno.env.get("INCLUDE_DEBUG_IN_RESPONSE") === "true";
const BOOTSTRAP_ALIGN_PROFILE_ID = Deno.env.get("BOOTSTRAP_ALIGN_PROFILE_ID") === "true";

const normalizeEmail = (value: string | null | undefined): string | null => value?.trim().toLowerCase() ?? null;

const normalizeRole = (role: string) => {
  const normalized = role.trim().toLowerCase();
  if (normalized === "admin" || normalized === "administrador") return "Administrador";
  if (normalized === "editor") return "Editor";
  if (normalized === "viewer" || normalized === "espectador") return "Espectador";
  return role.trim();
};

const decodeJwtClaims = (token: string): Record<string, unknown> | null => {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const getHostname = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

const logDiagnostic = (requestId: string, stage: string, data: Record<string, unknown>) => {
  if (!DEBUG_LOGS) return;
  console.info(JSON.stringify({ function: FUNCTION_NAME, functionVersion: FUNCTION_VERSION, requestId, stage, ...data }));
};

const buildErrorBody = (
  code: ErrorCode,
  message: string,
  details: unknown,
  debug?: DebugPayload,
) => ({
  ok: false,
  error: {
    code,
    message,
    details,
    ...(INCLUDE_DEBUG_IN_RESPONSE && debug ? { debug } : {}),
  },
});

const jsonResponse = (
  body: unknown,
  status: number,
  requestId: string,
  debugHeaders?: { decision?: string; callerEmail?: string | null; callerId?: string | null },
) => {
  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "application/json",
    "x-request-id": requestId,
    "x-function-version": FUNCTION_VERSION,
  };

  if (INCLUDE_DEBUG_IN_RESPONSE) {
    headers["x-debug-decision"] = debugHeaders?.decision ?? "UNKNOWN";
    headers["x-debug-caller-email"] = debugHeaders?.callerEmail ?? "";
    headers["x-debug-caller-id"] = debugHeaders?.callerId ?? "";
  }

  return new Response(JSON.stringify(body), { status, headers });
};

const mapSupabaseAuthError = (message: string): { status: number; code: ErrorCode; message: string } => {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return { status: 409, code: "duplicate_email", message: "El email ya existe." };
  }
  if (normalized.includes("invalid email")) {
    return { status: 400, code: "invalid_email", message: "El email no es válido." };
  }
  if (normalized.includes("password") && (normalized.includes("weak") || normalized.includes("short") || normalized.includes("at least"))) {
    return { status: 400, code: "weak_password", message: "La contraseña no cumple los requisitos de seguridad." };
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
      headers: {
        ...corsHeaders,
        "x-request-id": requestId,
        "x-function-version": FUNCTION_VERSION,
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(buildErrorBody("bad_request", "Método no permitido.", null), 405, requestId);
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const decision: Decision = !authHeader ? "AUTH_MISSING" : "AUTH_INVALID";
      const debugPayload: DebugPayload = {
        requestId,
        functionVersion: FUNCTION_VERSION,
        decision,
        callerId: null,
        callerEmail: null,
        profileById: null,
        profileByEmail: null,
        profileByEmailCount: null,
        hasUniqueLowerEmailIndex: null,
        tokenProjectHost: null,
        functionProjectHost: getHostname(Deno.env.get("SUPABASE_URL")),
        alignedProfileId: false,
        errors: [],
      };
      logDiagnostic(requestId, "auth_denied", debugPayload);
      return jsonResponse(
        buildErrorBody("unauthorized", "No autorizado.", { decision }, debugPayload),
        401,
        requestId,
        { decision, callerEmail: null, callerId: null },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        buildErrorBody("internal_error", "Variables de entorno de Supabase incompletas.", null),
        500,
        requestId,
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const tokenClaims = decodeJwtClaims(token);
    const tokenProjectHost = getHostname(typeof tokenClaims?.iss === "string" ? tokenClaims.iss : null);
    const functionProjectHost = getHostname(SUPABASE_URL);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    const caller = authData.user;
    if (authError || !caller) {
      const debugPayload: DebugPayload = {
        requestId,
        functionVersion: FUNCTION_VERSION,
        decision: "AUTH_INVALID",
        callerId: null,
        callerEmail: null,
        profileById: null,
        profileByEmail: null,
        profileByEmailCount: null,
        hasUniqueLowerEmailIndex: null,
        tokenProjectHost,
        functionProjectHost,
        alignedProfileId: false,
        errors: authError?.message ? [authError.message] : [],
      };
      logDiagnostic(requestId, "auth_invalid", debugPayload);
      return jsonResponse(
        buildErrorBody("unauthorized", "Token inválido o expirado.", { decision: "AUTH_INVALID" }, debugPayload),
        401,
        requestId,
        { decision: "AUTH_INVALID", callerEmail: null, callerId: null },
      );
    }

    const callerEmail = normalizeEmail(caller.email);
    const callerId = caller.id;

    const { data: profileById, error: profileByIdError } = await serviceClient
      .from("profiles")
      .select("id,email,is_superadmin")
      .eq("id", callerId)
      .maybeSingle<CallerProfile>();

    const { data: profileByEmail, error: profileByEmailError } = await serviceClient
      .from("profiles")
      .select("id,email,is_superadmin")
      .eq("email", callerEmail ?? "")
      .maybeSingle<CallerProfile>();

    const { count: profileByEmailCount, error: profileByEmailCountError } = await serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email", callerEmail ?? "");

    const { data: indexRows, error: indexError } = await serviceClient
      .from("pg_indexes")
      .select("indexname")
      .eq("schemaname", "public")
      .eq("indexname", "profiles_email_lower_unique_idx")
      .limit(1);

    const hasUniqueLowerEmailIndex = !indexError && Array.isArray(indexRows) && indexRows.length > 0;

    if (profileByIdError || profileByEmailError || profileByEmailCountError) {
      const debugPayload: DebugPayload = {
        requestId,
        functionVersion: FUNCTION_VERSION,
        decision: "UNKNOWN",
        callerId,
        callerEmail,
        profileById: profileById ?? null,
        profileByEmail: profileByEmail ?? null,
        profileByEmailCount: profileByEmailCount ?? null,
        hasUniqueLowerEmailIndex,
        tokenProjectHost,
        functionProjectHost,
        alignedProfileId: false,
        errors: [profileByIdError?.message, profileByEmailError?.message, profileByEmailCountError?.message].filter(Boolean) as string[],
      };
      logDiagnostic(requestId, "profile_lookup_error", debugPayload);
      return jsonResponse(buildErrorBody("internal_error", "No se pudo validar el perfil del solicitante.", null, debugPayload), 500, requestId);
    }

    let decision: DebugPayload["decision"] = "UNKNOWN";
    let effectiveProfile = profileById ?? null;
    let alignedProfileId = false;

    if (tokenProjectHost && functionProjectHost && tokenProjectHost !== functionProjectHost) {
      decision = "ENV_MISMATCH_SUSPECTED";
    } else if (profileById?.is_superadmin) {
      effectiveProfile = profileById;
    } else if (profileById && !profileById.is_superadmin) {
      decision = "PROFILE_SUPERADMIN_FALSE";
    } else if (!profileById && !profileByEmail) {
      decision = "PROFILE_MISSING";
    } else if (!profileById && profileByEmail && !profileByEmail.is_superadmin) {
      decision = "NOT_SUPERADMIN_BY_EMAIL";
    } else if (!profileById && profileByEmail?.is_superadmin) {
      decision = "NOT_SUPERADMIN_BY_ID_BUT_EMAIL_SUPERADMIN_TRUE";
      if (hasUniqueLowerEmailIndex && BOOTSTRAP_ALIGN_PROFILE_ID && callerEmail) {
        const { data: alignedData, error: alignError } = await serviceClient
          .from("profiles")
          .update({ id: callerId, email: callerEmail, is_superadmin: true })
          .eq("email", callerEmail)
          .select("id,email,is_superadmin")
          .maybeSingle<CallerProfile>();

        if (!alignError && alignedData?.id === callerId && alignedData.is_superadmin) {
          effectiveProfile = alignedData;
          alignedProfileId = true;
        } else {
          decision = "NOT_SUPERADMIN_BY_ID";
        }
      } else {
        decision = "NOT_SUPERADMIN_BY_ID";
      }
    }

    const debugPayload: DebugPayload = {
      requestId,
      functionVersion: FUNCTION_VERSION,
      decision,
      callerId,
      callerEmail,
      profileById: profileById ?? null,
      profileByEmail: profileByEmail ?? null,
      profileByEmailCount: profileByEmailCount ?? null,
      hasUniqueLowerEmailIndex,
      tokenProjectHost,
      functionProjectHost,
      alignedProfileId,
      errors: [indexError?.message].filter(Boolean) as string[],
    };

    logDiagnostic(requestId, "authorization_decision", debugPayload);

    if (!effectiveProfile?.is_superadmin) {
      const deniedDecision: Decision = (
        [
          "NOT_SUPERADMIN_BY_ID",
          "NOT_SUPERADMIN_BY_EMAIL",
          "PROFILE_MISSING",
          "PROFILE_SUPERADMIN_FALSE",
          "AUTH_MISSING",
          "AUTH_INVALID",
          "ENV_MISMATCH_SUSPECTED",
        ] as const
      ).includes(decision as Decision)
        ? (decision as Decision)
        : "UNKNOWN";

      return jsonResponse(
        buildErrorBody(
          "forbidden",
          "Solo el superadministrador puede gestionar usuarios.",
          { decision: deniedDecision },
          { ...debugPayload, decision: deniedDecision },
        ),
        403,
        requestId,
        { decision: deniedDecision, callerEmail, callerId },
      );
    }

    const payload = (await req.json()) as CreateUserPayload;
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password?.trim();
    const fullName = payload.full_name?.trim() ?? null;
    const requestedRoles = payload.roles ?? (payload.role ? [payload.role] : []);

    if (!email || !password || password.length < 8) {
      return jsonResponse(buildErrorBody("bad_request", "Email y contraseña válida (mínimo 8 caracteres) son obligatorios.", null), 400, requestId);
    }
    if (!EMAIL_REGEX.test(email)) {
      return jsonResponse(buildErrorBody("invalid_email", "El email no es válido.", null), 400, requestId);
    }
    if (requestedRoles.length === 0) {
      return jsonResponse(buildErrorBody("bad_request", "Debes indicar al menos un rol.", null), 400, requestId);
    }

    const normalizedRoles = [...new Set(requestedRoles.map((role) => normalizeRole(role)).filter(Boolean))];
    if (normalizedRoles.length === 0 || normalizedRoles.some((role) => !ASSIGNABLE_ROLES.has(role))) {
      return jsonResponse(
        buildErrorBody("bad_request", "Roles inválidos. Solo se permiten: Administrador, Editor y Espectador.", null),
        400,
        requestId,
      );
    }

    const { data: createdUserData, error: createUserError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
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
      { id: newUserId, email, full_name: fullName, is_superadmin: false },
      { onConflict: "id" },
    );

    if (profileUpsertError) {
      await serviceClient.auth.admin.deleteUser(newUserId);
      return jsonResponse(
        buildErrorBody("internal_error", "No se pudo crear el perfil del usuario.", { supabaseMessage: profileUpsertError.message }),
        500,
        requestId,
      );
    }

    const roleRows = normalizedRoles.map((role) => ({ user_id: newUserId, role }));
    const { error: rolesError } = await serviceClient.from("user_roles").upsert(roleRows, { onConflict: "user_id,role" });

    if (rolesError) {
      await serviceClient.auth.admin.deleteUser(newUserId);
      await serviceClient.from("profiles").delete().eq("id", newUserId);
      return jsonResponse(
        buildErrorBody("bad_request", "No se pudieron asignar los roles.", { supabaseMessage: rolesError.message }),
        400,
        requestId,
      );
    }

    return jsonResponse(
      {
        ok: true,
        userId: newUserId,
        email,
        ...(INCLUDE_DEBUG_IN_RESPONSE ? { debug: { requestId, functionVersion: FUNCTION_VERSION } } : {}),
      },
      201,
      requestId,
      { decision: "UNKNOWN", callerEmail, callerId },
    );
  } catch (error) {
    console.error(JSON.stringify({ function: FUNCTION_NAME, functionVersion: FUNCTION_VERSION, stage: "exception", error: error instanceof Error ? error.message : String(error) }));
    return jsonResponse(buildErrorBody("internal_error", "Error interno.", null), 500, requestId);
  }
});
