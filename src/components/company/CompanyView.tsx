import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Pencil, Plus, ToggleLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
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
  const [companyName, setCompanyName] = useState("");
  const [companyForm, setCompanyForm] = useState({
    legal_name: "",
    cif: "",
    address: "",
    city: "",
    postal_code: "",
    province: "",
    country: "España",
    phone: "",
    email: "",
    website: "",
  });
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "Espectador",
  });
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: "", jobTitle: "", role: "Espectador", email: "" });
  const [editingUserId, setEditingUserId] = useState<string>("");
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
    return "Error desconocido.";
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
    const fetchCompany = async () => {
      if (!profile?.company_id) return;

      const { data, error } = await supabase
        .from("companies")
        .select("name, legal_name, cif, address, city, postal_code, province, country, phone, email, website")
        .eq("id", profile.company_id)
        .maybeSingle();

      if (error) {
        toast({
          title: "No se pudo cargar la empresa",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setCompanyName((data as any)?.name ?? "");
      setCompanyForm({
        legal_name: (data as any)?.legal_name ?? "",
        cif: (data as any)?.cif ?? "",
        address: (data as any)?.address ?? "",
        city: (data as any)?.city ?? "",
        postal_code: (data as any)?.postal_code ?? "",
        province: (data as any)?.province ?? "",
        country: (data as any)?.country ?? "España",
        phone: (data as any)?.phone ?? "",
        email: (data as any)?.email ?? "",
        website: (data as any)?.website ?? "",
      });
    };

    void fetchCompany();
  }, [profile?.company_id, toast]);

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
        const adminRes = await (supabase as any).rpc("has_role", { _role: "Administrador", _user_id: session.user.id });
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

  const createUserBySuperadmin = async (createUserPayload: {
    email: string;
    password: string;
    full_name: string;
    role: string;
  }) => {
    if (!isSuperadmin) {
      throw new Error("Unauthorized: only superadmin can create users");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("No se encontró una sesión autenticada activa.");
    }

    const functionName = "admin-create-user";
    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
    const rawResponse = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(createUserPayload),
    });

    const rawBodyText = await rawResponse.text();
    let parsedBody: unknown = null;
    if (rawBodyText) {
      try {
        parsedBody = JSON.parse(rawBodyText);
      } catch {
        parsedBody = rawBodyText;
      }
    }

    if (debugUserCreation) {
      console.info("[company-users] function response", {
        functionName,
        hasAuthorizationHeader: true,
        status: rawResponse.status,
        rawBodyText,
        body: parsedBody,
      });
    }

    if (!rawResponse.ok) {
      let specificMessage = "No se pudo crear el usuario.";
      if (parsedBody && typeof parsedBody === "object") {
        const maybeError = (parsedBody as { error?: { message?: string } | string }).error;
        if (typeof maybeError === "string") {
          specificMessage = maybeError;
        } else if (maybeError && typeof maybeError === "object" && typeof maybeError.message === "string") {
          specificMessage = maybeError.message;
        }
      }

      throw new Error(specificMessage);
    }
  };

  const handleCreateUser = async () => {
    if (!isSuperadmin) {
      toast({
        title: "Acceso no autorizado",
        description: "Solo el superadministrador puede crear usuarios.",
        variant: "destructive",
      });
      return;
    }

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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      console.info("[company-users] invoking function", {
        functionName: "admin-create-user",
        sessionExists: Boolean(session),
        accessTokenLength: session?.access_token?.length ?? 0,
        sessionError: sessionError?.message ?? null,
        userId: userData?.user?.id ?? null,
        userEmail: userData?.user?.email ?? null,
        userError: userError?.message ?? null,
        payload: {
          ...createUserPayload,
          password: "[REDACTED]",
        },
      });
    }

    try {
      await createUserBySuperadmin(createUserPayload);
    } catch (error) {
      setIsSubmitting(false);
      toast({
        title: "No se pudo crear el usuario",
        description: error instanceof Error ? error.message : "No se pudo crear el usuario.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(false);

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

  const handleDeleteUser = async (targetUserId: string, email: string) => {
    if (!confirm(`¿Seguro que quieres eliminar al usuario ${email}? Esta acción no se puede deshacer.`)) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast({ title: "Sesión inválida", variant: "destructive" });
      return;
    }

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`;
    const res = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ target_user_id: targetUserId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo eliminar el usuario",
        description: (body as any)?.error ?? "Error desconocido.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Usuario eliminado" });
    void fetchUsers();
  };

  const handleSaveCompany = async () => {
    if (!profile?.company_id || !companyName.trim()) {
      toast({
        title: "Datos incompletos",
        description: "El nombre de la empresa es obligatorio.",
        variant: "destructive",
      });
      return;
    }

    setIsCompanySaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: companyName.trim(),
        legal_name: companyForm.legal_name.trim() || null,
        cif: companyForm.cif.trim() || null,
        address: companyForm.address.trim() || null,
        city: companyForm.city.trim() || null,
        postal_code: companyForm.postal_code.trim() || null,
        province: companyForm.province.trim() || null,
        country: companyForm.country.trim() || null,
        phone: companyForm.phone.trim() || null,
        email: companyForm.email.trim() || null,
        website: companyForm.website.trim() || null,
      } as any)
      .eq("id", profile.company_id);

    setIsCompanySaving(false);

    if (error) {
      toast({
        title: "No se pudo guardar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Perfil actualizado",
      description: "Se guardaron los datos de la empresa.",
    });
  };

  const handleOpenEditUser = async (userItem: UserDirectoryEntry) => {
    setEditingUserId(userItem.id);
    // Fetch full profile data including job_title
    const { data } = await supabase
      .from("profiles")
      .select("full_name, job_title")
      .or(`user_id.eq.${userItem.id},id.eq.${userItem.id}`)
      .maybeSingle();

    setEditForm({
      fullName: (data as any)?.full_name ?? userItem.full_name ?? "",
      jobTitle: (data as any)?.job_title ?? "",
      role: userItem.is_superadmin ? "Superadmin" : (userItem.role ?? "Espectador"),
      email: userItem.email ?? "",
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEditUser = async () => {
    if (!editingUserId) return;
    setIsSubmitting(true);

    try {
      // Update profile (full_name, job_title)
      const { error: profileError } = await (supabase as any)
        .from("profiles")
        .update({ full_name: editForm.fullName.trim() || null, job_title: editForm.jobTitle.trim() || null })
        .eq("user_id", editingUserId);

      if (profileError) throw profileError;

      // Update email if changed (superadmin only, via edge function)
      const currentUser = users.find((u) => u.id === editingUserId);
      if (currentUser && editForm.email.trim() && editForm.email.trim() !== currentUser.email) {
        const { error: emailError } = await supabase.functions.invoke("admin-update-user-email", {
          body: { target_user_id: editingUserId, new_email: editForm.email.trim() },
        });
        if (emailError) throw new Error(emailError.message || "No se pudo actualizar el email.");
      }

      // Update role if not superadmin and role changed
      if (currentUser && !currentUser.is_superadmin && editForm.role !== "Superadmin" && editForm.role !== currentUser.role) {
        await (supabase as any)
          .from("user_roles")
          .delete()
          .eq("user_id", editingUserId);

        await (supabase as any)
          .from("user_roles")
          .insert({ user_id: editingUserId, role: editForm.role });
      }

      toast({ title: "Usuario actualizado" });
      setIsEditDialogOpen(false);
      setEditingUserId("");
      void fetchUsers();
    } catch (e: any) {
      toast({
        title: "No se pudo actualizar",
        description: e.message ?? "Error desconocido.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Nombre de la empresa</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Esta vista solo muestra y permite editar datos reales disponibles en la base de datos.
              </p>
            </div>
            <Button variant="accent" onClick={handleSaveCompany} disabled={isCompanySaving}>
              {isCompanySaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Usuarios</h3>
                <p className="text-sm text-muted-foreground">Gestiona accesos, roles y licencias.</p>
              </div>
              {isSuperadmin && (
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
              )}
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
                    {isSuperadmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditUser(userItem)}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Editar
                      </Button>
                    )}
                    {canManagePasswords && (
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
                    )}
                    {isSuperadmin && !userItem.is_superadmin && userItem.id !== user?.id && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteUser(userItem.id, userItem.email)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Eliminar
                      </Button>
                    )}
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

      {isSuperadmin && (<Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
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
      </Dialog>)}

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

      {isSuperadmin && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar usuario</DialogTitle>
              <DialogDescription>
                Modifica los datos del usuario seleccionado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Nombre y apellidos"
                />
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Input
                  value={editForm.jobTitle}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, jobTitle: e.target.value }))}
                  placeholder="Ej: Responsable de Calidad"
                />
              </div>
              {!users.find((u) => u.id === editingUserId)?.is_superadmin && (
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Administrador">Administrador</SelectItem>
                      <SelectItem value="Editor">Editor</SelectItem>
                      <SelectItem value="Espectador">Espectador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="accent" onClick={handleSaveEditUser} disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
