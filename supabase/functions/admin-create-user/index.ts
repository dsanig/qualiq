import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const ASSIGNABLE_ROLES = new Set(["Administrador", "Editor", "Espectador"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBUG_LOGS = Deno.env.get("DEBUG_USER_CREATION") === "true";
const INCLUDE_DEBUG_IN_RESPONSE = DEBUG_LOGS;

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

const decodeJwtClaims = (token: string): Record<string, unknown> | null => {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
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
    const functionProjectHost = getHostname(SUPABASE_URL);
    const tokenIss = typeof tokenClaims?.iss === "string" ? tokenClaims.iss : null;
    const tokenProjectHost = tokenIss ? getHostname(tokenIss) : null;

    if (DEBUG_LOGS) {
      console.info("[admin-create-user] auth diagnostics", {
        requestId,
        hasAuthorizationHeader: Boolean(authHeader),
        jwtSub: tokenClaims?.sub ?? null,
        jwtEmail: tokenClaims?.email ?? null,
        jwtRole: tokenClaims?.role ?? null,
      });
    }

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

    if (authError || !caller) {
      return jsonResponse(buildErrorBody("unauthorized", "Token inválido o expirado."), 401, requestId);
    }

    const {
      data: callerProfile,
      error: callerProfileError,
    } = await serviceClient
      .from("profiles")
      .select("id, email, is_superadmin")
      .eq("id", caller.id)
      .maybeSingle<CallerProfile>();

    const debugPayload = {
      roleSource: "profiles.is_superadmin",
      caller: {
        id: caller.id,
        email: caller.email ?? null,
      },
      callerProfile: callerProfile ?? null,
      callerProfileError: callerProfileError ? callerProfileError.message : null,
    };

    if (DEBUG_LOGS) {
      console.info("[admin-create-user] superadmin check", {
        requestId,
        ...debugPayload,
      });
    }

    if (callerProfileError || !callerProfile?.is_superadmin) {
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

    if (DEBUG_LOGS) {
      console.info("[admin-create-user] incoming payload", {
        requestId,
        email,
        fullName,
        role: payload.role,
        roles: payload.roles,
      });
    }

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

    const responseBody = {
      ok: true,
      userId: newUserId,
      email,
      ...(INCLUDE_DEBUG_IN_RESPONSE ? { debug: debugPayload } : {}),
    };

    if (DEBUG_LOGS) {
      console.info("[admin-create-user] success", { requestId, status: 201, body: responseBody });
    }

    return jsonResponse(responseBody, 201, requestId);
  } catch (error) {
    console.error("[admin-create-user] error", { requestId, error });
    return jsonResponse(
      buildErrorBody("internal_error", error instanceof Error ? error.message : "Error interno."),
      500,
      requestId,
    );
  }
});
