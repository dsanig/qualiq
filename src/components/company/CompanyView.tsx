import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Plus, ToggleLeft } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeatureToggles } from "./FeatureToggles";
import { useAuth } from "@/hooks/useAuth";

const mockCompany = {
  name: "QualiQ Labs",
  legalName: "QualiQ Labs S.L.",
  industry: "Calidad y cumplimiento",
  size: "250-500",
  address: "Calle Gran Vía 45, Madrid",
  city: "Madrid",
  postalCode: "28013",
  country: "España",
  cif: "B-12345678",
  vat: "ESB12345678",
  contact: "contacto@qualiq.ai",
  phone: "+34 910 000 000",
  dpo: "dpo@qualiq.ai",
  complianceLead: "María García",
  regulatoryScope: "ISO 9001, GMP, GDP",
};

type UserDirectoryEntry = {
  id: string;
  email: string;
  full_name: string | null;
  role: "Administrador" | "Editor" | "Espectador";
  is_superadmin: boolean;
  created_at: string;
};


export function CompanyView() {
  const { canManageCompany, canManagePasswords, isSuperadmin, refreshPermissions } = usePermissions();
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("perfil");
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [users, setUsers] = useState<UserDirectoryEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "Espectador",
  });
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devDetectedRole, setDevDetectedRole] = useState<string>("Desconocido");
  const debugUserCreation = import.meta.env.DEV || import.meta.env.VITE_DEBUG_USER_CREATION === "true";

  const decodeJwtClaims = (token: string) => {
    const payload = token.split(".")[1];
    if (!payload) return null;

    try {
      const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const extractFunctionErrorMessage = async (error: unknown) => {
    if (error instanceof FunctionsHttpError) {
      const response = error.context;
      const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-amzn-requestid");

      let parsedBody: unknown = null;
      const rawBody = await response.clone().text();
      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = rawBody;
        }
      }

      if (debugUserCreation) {
        console.info("[company-users] function error", {
          functionName: "admin-create-user",
          status: response.status,
          requestId,
          body: parsedBody,
        });
      }

      if (parsedBody && typeof parsedBody === "object") {
        const maybeError = (parsedBody as { error?: { message?: string } | string }).error;
        if (typeof maybeError === "string") {
          return maybeError;
        }
        if (maybeError && typeof maybeError === "object" && typeof maybeError.message === "string") {
          return maybeError.message;
        }
      }

      return `Error del servidor (${response.status}).`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "No se pudo crear el usuario.";
  };

  const fetchUsers = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("user_directory")
      .select("id, email, full_name, role, is_superadmin, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "No se pudieron cargar usuarios",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setUsers((data ?? []) as UserDirectoryEntry[]);
  }, [toast]);

  useEffect(() => {
    if (canManageCompany) {
      void fetchUsers();
    }
  }, [canManageCompany, fetchUsers]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  useEffect(() => {
    const loadDevAuthDiagnostics = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setDevDetectedRole("Sin sesión");
        return;
      }

      const claims = decodeJwtClaims(session.access_token);
      const superRes = await (supabase as any).rpc("is_superadmin", { uid: session.user.id });

      let detectedRole = "Espectador";
      if (!superRes.error && Boolean(superRes.data)) {
        detectedRole = "Superadmin";
      } else {
        const adminRes = await (supabase as any).rpc("has_role", { uid: session.user.id, r: "Administrador" });
        if (!adminRes.error && Boolean(adminRes.data)) detectedRole = "Administrador";
      }

      setDevDetectedRole(detectedRole);

      if (debugUserCreation) {
        console.info("[company-users] auth diagnostics", {
          userId: session.user.id,
          email: session.user.email,
          app_metadata: session.user.app_metadata,
          user_metadata: session.user.user_metadata,
          jwt_claims: claims,
          role_claim: claims?.role,
          app_role_claim: claims?.app_role,
          qualiq_role_claim: claims?.qualiq_role,
          company_role_claim: claims?.company_role,
          detected_app_role: detectedRole,
        });
      }
    };

    if (import.meta.env.DEV) {
      void loadDevAuthDiagnostics();
    }
  }, [debugUserCreation]);

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.password) {
      toast({
        title: "Campos obligatorios",
        description: "Email y contraseña son obligatorios.",
        variant: "destructive",
      });
      return;
    }

    if (createForm.password.length < 8) {
      toast({
        title: "Contraseña inválida",
        description: "La contraseña debe tener al menos 8 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      toast({
        title: "Contraseñas no coinciden",
        description: "Confirma la misma contraseña para crear el usuario.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const createUserPayload = {
      email: createForm.email,
      password: createForm.password,
      full_name: createForm.fullName,
      role: createForm.role,
    };

    if (debugUserCreation) {
      console.info("[company-users] invoking function", {
        functionName: "admin-create-user",
        payload: {
          ...createUserPayload,
          password: "[REDACTED]",
        },
      });
    }

    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        ...createUserPayload,
      },
    });

    if (debugUserCreation) {
      console.info("[company-users] function response", {
        functionName: "admin-create-user",
        status: error ? "error" : "ok",
        body: data,
      });
    }

    setIsSubmitting(false);

    if (error) {
      const specificMessage = await extractFunctionErrorMessage(error);
      toast({
        title: "No se pudo crear el usuario",
        description: specificMessage,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Usuario creado",
      description: "Usuario creado con contraseña inicial.",
    });
    setCreateForm({ fullName: "", email: "", password: "", confirmPassword: "", role: "Espectador" });
    setIsUserDialogOpen(false);
    void fetchUsers();
  };

  const handleUpdatePassword = async () => {
    if (!selectedUserId) {
      toast({ title: "Selecciona un usuario", variant: "destructive" });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast({
        title: "Contraseña inválida",
        description: "La nueva contraseña debe tener al menos 8 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Contraseñas no coinciden", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.functions.invoke("admin-update-user-password", {
      body: { target_user_id: selectedUserId, new_password: passwordForm.newPassword },
    });
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "No se pudo actualizar la contraseña",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Contraseña actualizada" });
    setPasswordForm({ newPassword: "", confirmPassword: "" });
    setSelectedUserId("");
    setIsPasswordDialogOpen(false);
  };

  if (!canManageCompany) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Building2 className="w-6 h-6 text-accent" />
          <div>
            <h3 className="font-semibold text-foreground">Acceso restringido a Empresa</h3>
            <p className="text-sm text-muted-foreground">
              Los datos completos de la empresa están disponibles solo para Administrador o Superadmin.
            </p>
          </div>
        </div>
        <Button
          variant="accent"
          onClick={() => (window.location.href = "mailto:admin@qualiq.ai?subject=Solicitud%20de%20acceso%20a%20Empresa")}
        >
          <Mail className="w-4 h-4 mr-2" />
          Solicitar acceso por email
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={cn("grid max-w-lg", isSuperadmin ? "grid-cols-3" : "grid-cols-2")}>
          <TabsTrigger value="perfil">Perfil empresa</TabsTrigger>
          <TabsTrigger value="usuarios" data-testid="company-users-tab">Usuarios</TabsTrigger>
          {isSuperadmin && <TabsTrigger value="modulos">Módulos</TabsTrigger>}
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Perfil de la empresa</h3>
              <Button variant="outline">Editar perfil</Button>
            </div>
            <div className="rounded-lg border border-border p-4 bg-secondary/20">
              <p className="text-sm font-medium text-foreground">Flujo de administración</p>
              <ol className="mt-2 text-xs text-muted-foreground list-decimal list-inside space-y-1">
                <li>Completa la ficha de empresa y guarda los datos fiscales.</li>
                <li>Configura usuarios y roles en la pestaña "Usuarios".</li>
                <li>Revisa la facturación y genera facturas españolas si es necesario.</li>
              </ol>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre comercial</Label>
                <Input defaultValue={mockCompany.name} />
              </div>
              <div className="space-y-2">
                <Label>Razón social</Label>
                <Input defaultValue={mockCompany.legalName} />
              </div>
              <div className="space-y-2">
                <Label>Industria</Label>
                <Input defaultValue={mockCompany.industry} />
              </div>
              <div className="space-y-2">
                <Label>Tamaño</Label>
                <Select defaultValue={mockCompany.size}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-50">1-50</SelectItem>
                    <SelectItem value="51-250">51-250</SelectItem>
                    <SelectItem value="250-500">250-500</SelectItem>
                    <SelectItem value="500+">500+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CIF</Label>
                <Input defaultValue={mockCompany.cif} />
              </div>
              <div className="space-y-2">
                <Label>IVA intracomunitario</Label>
                <Input defaultValue={mockCompany.vat} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Dirección</Label>
                <Textarea defaultValue={mockCompany.address} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Ciudad</Label>
                <Input defaultValue={mockCompany.city} />
              </div>
              <div className="space-y-2">
                <Label>Código postal</Label>
                <Input defaultValue={mockCompany.postalCode} />
              </div>
              <div className="space-y-2">
                <Label>País</Label>
                <Input defaultValue={mockCompany.country} />
              </div>
              <div className="space-y-2">
                <Label>Email de contacto</Label>
                <Input defaultValue={mockCompany.contact} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input defaultValue={mockCompany.phone} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delegado de protección de datos (DPO)</Label>
                <Input defaultValue={mockCompany.dpo} />
              </div>
              <div className="space-y-2">
                <Label>Responsable de cumplimiento</Label>
                <Input defaultValue={mockCompany.complianceLead} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Ámbitos regulatorios</Label>
                <Textarea defaultValue={mockCompany.regulatoryScope} rows={2} />
              </div>
            </div>
            <Button
              variant="accent"
              onClick={() =>
                toast({
                  title: "Perfil actualizado",
                  description: "Los datos de la empresa se han guardado correctamente.",
                })
              }
            >
              Guardar cambios
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-4">
            {import.meta.env.DEV && (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground" data-testid="dev-auth-diagnostics">
                <p className="font-medium text-foreground">Diagnóstico (DEV)</p>
                <p>user.id: {user?.id ?? "-"}</p>
                <p>email: {user?.email ?? "-"}</p>
                <p>rol detectado: {devDetectedRole}</p>
                <p>company_id: {profile?.company_id ?? "-"}</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Usuarios</h3>
                <p className="text-sm text-muted-foreground">Gestiona accesos, roles y licencias.</p>
              </div>
              <Button
                variant="accent"
                onClick={() => {
                  setIsUserDialogOpen(true);
                }}
                data-testid="create-user-button"
              >
                <Plus className="w-4 h-4 mr-2" />
                Crear usuario
              </Button>
            </div>

            <div className="space-y-3">
              {users.map((userItem) => (
                <div key={userItem.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">{userItem.full_name || "Sin nombre"}</p>
                    <p className="text-xs text-muted-foreground">{userItem.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-secondary px-2 py-1 rounded-full">
                      {userItem.is_superadmin ? "Superadministrador" : userItem.role}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`change-password-${userItem.id}`}
                      onClick={() => {
                        setSelectedUserId(userItem.id);
                        setIsPasswordDialogOpen(true);
                      }}
                    >
                      Cambiar contraseña
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {isSuperadmin && (
          <TabsContent value="modulos" className="mt-6">
            <FeatureToggles companyId={profile?.company_id || ""} />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="create-user-modal">
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
            <DialogDescription>
              Crear usuario con contraseña inicial (sin flujo de invitación por email).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                data-testid="create-user-name"
                value={createForm.fullName}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Nombre y apellidos"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                data-testid="create-user-email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="usuario@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                data-testid="create-user-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar contraseña</Label>
              <Input
                data-testid="create-user-confirm-password"
                type="password"
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Repite la contraseña"
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                value={createForm.role}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, role: value }))}
              >
                <SelectTrigger data-testid="create-user-role">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Administrador">Administrador</SelectItem>
                  <SelectItem value="Editor">Editor</SelectItem>
                  <SelectItem value="Espectador">Espectador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              onClick={handleCreateUser}
              disabled={isSubmitting}
              data-testid="create-user-save"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="change-password-modal">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña de usuario</DialogTitle>
            <DialogDescription>
              Solo el superadministrador puede establecer una nueva contraseña para otros usuarios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input
                data-testid="new-password-input"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar contraseña</Label>
              <Input
                data-testid="confirm-password-input"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="accent" onClick={handleUpdatePassword} disabled={isSubmitting} data-testid="update-password-save">
              Actualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
