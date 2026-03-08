import { useState, useEffect } from "react";
import { Globe, UserCircle, ShieldCheck, Eye, EyeOff, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TwoFactorSettings } from "./TwoFactorSettings";

export function SettingsView() {
  const { user, profile } = useAuth();
  const { isSuperadmin, isAdministrador, isEditor, canManageCompany } = usePermissions();

  const roleName = isSuperadmin ? "Superadmin" : isAdministrador ? "Administrador" : isEditor ? "Editor" : "Espectador";

  // Profile state
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [jobTitle, setJobTitle] = useState((profile as any)?.job_title ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setJobTitle((profile as any)?.job_title ?? "");
  }, [profile?.full_name, (profile as any)?.job_title]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, job_title: jobTitle.trim() || null } as any)
        .eq("user_id", user.id);

      if (error) throw error;
      toast.success("Perfil actualizado correctamente.");
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar el perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Contraseña actualizada correctamente.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al cambiar la contraseña.");
    } finally {
      setSavingPassword(false);
    }
  };

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Language card */}
      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-accent" />
          <div>
            <h3 className="font-semibold text-foreground">Idioma de la interfaz</h3>
            <p className="text-sm text-muted-foreground">QualiQ está configurado en español para todos los usuarios.</p>
          </div>
        </div>
        <div className="max-w-xs rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground">
          Idioma activo: Español (fijo)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile card */}
        <div className="bg-card rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <UserCircle className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-semibold text-foreground">Perfil del usuario</h3>
              <p className="text-sm text-muted-foreground">Datos de cuenta y acceso.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="settings-email" className="text-xs text-muted-foreground">Correo electrónico</Label>
              <Input id="settings-email" value={user?.email ?? ""} disabled className="mt-1 bg-muted/40" />
            </div>
            <div>
              <Label htmlFor="settings-name" className="text-xs text-muted-foreground">Nombre completo</Label>
              <Input
                id="settings-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre completo"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="settings-job-title" className="text-xs text-muted-foreground">Cargo</Label>
              <Input
                id="settings-job-title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Ej: Responsable de Calidad"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">Rol:</span> {roleName}</p>
              <p><span className="font-medium text-foreground">Último acceso:</span> {lastSignIn}</p>
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm">
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Guardar perfil
          </Button>
        </div>

        {/* Security card */}
        <div className="bg-card rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-semibold text-foreground">Cambiar contraseña</h3>
              <p className="text-sm text-muted-foreground">Actualiza tu contraseña de acceso.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Label htmlFor="settings-new-pw" className="text-xs text-muted-foreground">Nueva contraseña</Label>
              <div className="relative mt-1">
                <Input
                  id="settings-new-pw"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="relative">
              <Label htmlFor="settings-confirm-pw" className="text-xs text-muted-foreground">Confirmar contraseña</Label>
              <div className="relative mt-1">
                <Input
                  id="settings-confirm-pw"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <Button onClick={handleChangePassword} disabled={savingPassword || !newPassword} size="sm">
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            Cambiar contraseña
          </Button>
        </div>
      </div>

      {/* 2FA card */}
      <TwoFactorSettings />
    </div>
  );
}
