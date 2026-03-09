import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type SignatureConfirmationPayload = {
  confirmationText: string;
  password: string;
};

const parseSignatureConfirmationHttpError = async (error: FunctionsHttpError) => {
  const response = error.context;
  let parsedBody: unknown = null;
  const rawBody = await response.clone().text();

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }
  }

  const backendError =
    parsedBody && typeof parsedBody === "object" && "error" in parsedBody
      ? (parsedBody as { error?: { code?: string; message?: string } | string }).error
      : null;

  const backendCode =
    backendError && typeof backendError === "object" && "code" in backendError
      ? backendError.code
      : null;

  if (backendCode === "INVALID_CONFIRMATION_TEXT") return "Debe escribir exactamente FIRMAR.";
  if (backendCode === "PASSWORD_REQUIRED") return "Debe introducir su contraseña actual.";
  if (backendCode === "PASSWORD_INVALID") return "La contraseña introducida no es correcta.";
  if (backendCode === "AUTH_USER_UNAVAILABLE" || backendCode === "AUTH_CONTEXT_MISSING") {
    return "No se pudo verificar la identidad del usuario actual.";
  }

  if (backendError && typeof backendError === "object" && typeof backendError.message === "string") {
    return backendError.message;
  }

  return `No se pudo validar la confirmación de firma (HTTP ${response.status}).`;
};

const verifyWithCurrentSessionCredentials = async ({ password }: { password: string }) => {
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user?.email) {
    return "No se pudo verificar la identidad del usuario actual.";
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (signInError) {
    return "La contraseña introducida no es correcta.";
  }

  return null;
};

export const verifySignatureConfirmation = async ({ confirmationText, password }: SignatureConfirmationPayload) => {
  const { error: verifyError } = await supabase.functions.invoke("verify-signature-confirmation", {
    body: {
      confirmation_text: confirmationText,
      password,
    },
  });

  if (!verifyError) return null;

  if (verifyError instanceof FunctionsHttpError) {
    return parseSignatureConfirmationHttpError(verifyError);
  }

  return verifyWithCurrentSessionCredentials({ password });
};
