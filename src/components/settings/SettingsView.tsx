import { Globe, UserCircle, ShieldCheck, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

export function SettingsView() {
  const { user } = useAuth();
  const { isSuperadmin, isAdministrador, isEditor } = usePermissions();

  const roleName = isSuperadmin ? "Superadmin" : isAdministrador ? "Administrador" : isEditor ? "Editor" : "Espectador";

  return (
    <div className="space-y-6 animate-fade-in">
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
        <div className="bg-card rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <UserCircle className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-semibold text-foreground">Perfil del usuario</h3>
              <p className="text-sm text-muted-foreground">Datos de cuenta y acceso.</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Usuario:</span> {user?.email ?? "—"}</p>
            <p><span className="font-medium text-foreground">Rol:</span> {roleName}</p>
            <p><span className="font-medium text-foreground">Último acceso:</span> Hoy</p>
          </div>
          <Button variant="outline">Actualizar perfil</Button>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-semibold text-foreground">Seguridad y accesos</h3>
              <p className="text-sm text-muted-foreground">Configuración de seguridad de la cuenta.</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">MFA:</span> Activo</p>
            <p><span className="font-medium text-foreground">Sesiones activas:</span> 2 dispositivos</p>
            <p><span className="font-medium text-foreground">Política de contraseña:</span> 90 días</p>
          </div>
          <Button variant="outline">Revisar seguridad</Button>
        </div>
      </div>
    </div>
  );
}
