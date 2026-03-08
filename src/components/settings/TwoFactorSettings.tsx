import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type EnrollState = "idle" | "enrolling" | "verifying";

export function TwoFactorSettings() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollState, setEnrollState] = useState<EnrollState>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const checkMfaStatus = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = data?.totp?.find((f) => (f.status as string) === "verified");
      if (verifiedTotp) {
        setIsEnabled(true);
        setFactorId(verifiedTotp.id);
      } else {
        setIsEnabled(false);
        setFactorId(null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    setEnrollState("enrolling");
    try {
      // Clean up any unverified factors first
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = existing?.totp?.filter((f) => f.status === "unverified") ?? [];
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "QualiQ" });
      if (error) throw error;

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrollState("verifying");
    } catch (e: any) {
      toast.error(e.message ?? "Error al iniciar la configuración 2FA.");
      setEnrollState("idle");
    }
  };

  const handleVerifyEnrollment = async () => {
    if (code.length !== 6 || !factorId) return;
    setVerifying(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (vErr) {
        toast.error("Código incorrecto. Inténtalo de nuevo.");
        setCode("");
        setVerifying(false);
        return;
      }

      toast.success("Autenticación de dos factores activada correctamente.");
      setIsEnabled(true);
      setEnrollState("idle");
      setQrCode("");
      setSecret("");
      setCode("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al verificar.");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!factorId) return;
    setDisabling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("Autenticación de dos factores desactivada.");
      setIsEnabled(false);
      setFactorId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al desactivar 2FA.");
    } finally {
      setDisabling(false);
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancelEnroll = async () => {
    // Unenroll the unverified factor
    if (factorId) {
      await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    }
    setEnrollState("idle");
    setQrCode("");
    setSecret("");
    setCode("");
    setFactorId(null);
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Comprobando estado 2FA…</span>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        {isEnabled ? (
          <ShieldCheck className="w-5 h-5 text-green-500" />
        ) : (
          <ShieldOff className="w-5 h-5 text-muted-foreground" />
        )}
        <div>
          <h3 className="font-semibold text-foreground">Autenticación de dos factores (2FA)</h3>
          <p className="text-sm text-muted-foreground">
            {isEnabled
              ? "Tu cuenta está protegida con un autenticador TOTP."
              : "Añade una capa extra de seguridad con una app autenticadora."}
          </p>
        </div>
      </div>

      {/* Already enabled */}
      {isEnabled && enrollState === "idle" && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-green-600 font-medium bg-green-500/10 px-2 py-1 rounded">✓ Activado</span>
          <Button variant="destructive" size="sm" onClick={handleDisable} disabled={disabling}>
            {disabling && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Desactivar 2FA
          </Button>
        </div>
      )}

      {/* Not enabled, idle */}
      {!isEnabled && enrollState === "idle" && (
        <Button size="sm" onClick={handleEnroll}>
          <ShieldCheck className="w-4 h-4 mr-1" />
          Activar 2FA
        </Button>
      )}

      {/* Enrolling state */}
      {enrollState === "enrolling" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Generando código QR…
        </div>
      )}

      {/* Verifying enrollment */}
      {enrollState === "verifying" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escanea este código QR con tu aplicación autenticadora (Google Authenticator, Microsoft Authenticator, Authy, etc.):
          </p>

          <div className="flex justify-center">
            <div className="bg-white p-3 rounded-lg inline-block">
              <img src={qrCode} alt="Código QR para 2FA" className="w-48 h-48" />
            </div>
          </div>

          {secret && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">O introduce este código manualmente:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all select-all">
                  {secret}
                </code>
                <Button variant="ghost" size="sm" onClick={handleCopySecret} className="shrink-0">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Introduce el código de 6 dígitos para confirmar:</p>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleVerifyEnrollment} disabled={code.length !== 6 || verifying} size="sm">
              {verifying && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Confirmar activación
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancelEnroll}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
