import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MfaVerifyStepProps {
  onVerified: () => void;
  onCancel: () => void;
}

export function MfaVerifyStep({ onVerified, onCancel }: MfaVerifyStepProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setIsVerifying(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.[0];
      if (!totpFactor) {
        toast({ title: "Error", description: "No se encontró factor TOTP.", variant: "destructive" });
        return;
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.id,
        code,
      });

      if (verifyError) {
        toast({ title: "Código incorrecto", description: "El código de verificación no es válido.", variant: "destructive" });
        setCode("");
        return;
      }

      onVerified();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Error al verificar.", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-14 h-14 rounded-xl bg-accent/20 flex items-center justify-center">
          <Shield className="w-7 h-7 text-accent" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">Verificación en dos pasos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Introduce el código de 6 dígitos de tu aplicación autenticadora.
        </p>
      </div>

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

      <div className="space-y-2">
        <Button onClick={handleVerify} disabled={code.length !== 6 || isVerifying} className="w-full">
          {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Verificar
        </Button>
        <Button variant="ghost" onClick={onCancel} className="w-full text-muted-foreground">
          Cancelar
        </Button>
      </div>
    </div>
  );
}
