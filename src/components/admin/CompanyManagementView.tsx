import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Pencil, Trash2, Users, FileText, AlertTriangle, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useAuditLog } from "@/hooks/useAuditLog";

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_type: string;
  created_at: string;
  users_count: number;
  documents_count: number;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  suspended: "Suspendida",
};

const PLAN_LABELS: Record<string, string> = {
  standard: "Estándar",
  professional: "Profesional",
  enterprise: "Enterprise",
};

export function CompanyManagementView() {
  const { isSuperadmin } = usePermissions();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", status: "active", plan_type: "standard", admin_email: "", admin_password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setIsLoading(true);

    const { data: companiesData, error } = await (supabase as any)
      .from("companies")
      .select("id, name, slug, status, plan_type, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error cargando empresas", description: error.message, variant: "destructive" });
      setIsLoading(false);
      return;
    }

    // Fetch counts for each company
    const enriched: CompanyRow[] = await Promise.all(
      (companiesData ?? []).map(async (c: any) => {
        const [profilesRes, docsRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", c.id),
          supabase.from("documents").select("id", { count: "exact", head: true }).eq("company_id", c.id),
        ]);
        return {
          ...c,
          users_count: profilesRes.count ?? 0,
          documents_count: docsRes.count ?? 0,
        };
      })
    );

    setCompanies(enriched);
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    if (isSuperadmin) void fetchCompanies();
  }, [isSuperadmin, fetchCompanies]);

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const handleOpenCreate = () => {
    setEditingCompany(null);
    setForm({ name: "", slug: "", status: "active", plan_type: "standard", admin_email: "", admin_password: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (company: CompanyRow) => {
    setEditingCompany(company);
    setForm({ name: company.name, slug: company.slug, status: company.status, plan_type: company.plan_type, admin_email: "", admin_password: "" });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast({ title: "Nombre y slug son obligatorios", variant: "destructive" });
      return;
    }

    // Validate admin fields for new company
    if (!editingCompany) {
      if (!form.admin_email.trim() || !form.admin_password.trim()) {
        toast({ title: "Email y contraseña del administrador son obligatorios", variant: "destructive" });
        return;
      }
      if (form.admin_password.trim().length < 8) {
        toast({ title: "La contraseña debe tener al menos 8 caracteres", variant: "destructive" });
        return;
      }
    }

    setIsSubmitting(true);

    if (editingCompany) {
      const { error } = await (supabase as any)
        .from("companies")
        .update({ name: form.name.trim(), slug: form.slug.trim(), status: form.status, plan_type: form.plan_type })
        .eq("id", editingCompany.id);

      if (error) {
        toast({ title: "Error actualizando empresa", description: error.message, variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      toast({ title: "Empresa actualizada" });
      logAction({ action: "update", entity_type: "company", entity_id: editingCompany.id, entity_title: form.name.trim(), details: { status: form.status, plan_type: form.plan_type } });
    } else {
      // Create company
      const { data: newCompany, error } = await (supabase as any)
        .from("companies")
        .insert({ name: form.name.trim(), slug: form.slug.trim(), status: form.status, plan_type: form.plan_type })
        .select("id")
        .single();

      if (error || !newCompany) {
        toast({ title: "Error creando empresa", description: error?.message, variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      // Create admin user for the new company
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (accessToken) {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("admin-create-user", {
          body: {
            email: form.admin_email.trim(),
            password: form.admin_password.trim(),
            full_name: "Administrador",
            roles: ["Administrador"],
            company_id: newCompany.id,
          },
        });

        if (fnError || (fnData && !fnData.ok)) {
          const errorMsg = fnData?.error?.message || fnError?.message || "Error desconocido";
          toast({ title: "Empresa creada, pero error al crear administrador", description: errorMsg, variant: "destructive" });
        } else {
          toast({ title: "Empresa y administrador creados correctamente" });
        }
      }

      logAction({ action: "create", entity_type: "company", entity_title: form.name.trim(), details: { slug: form.slug.trim(), plan_type: form.plan_type, admin_email: form.admin_email.trim() } });
    }

    setIsSubmitting(false);
    setIsDialogOpen(false);
    void fetchCompanies();
  };

  const handleToggleStatus = async (company: CompanyRow) => {
    const newStatus = company.status === "active" ? "inactive" : "active";
    const { error } = await (supabase as any)
      .from("companies")
      .update({ status: newStatus })
      .eq("id", company.id);

    if (error) {
      toast({ title: "Error cambiando estado", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: `Empresa ${newStatus === "active" ? "activada" : "desactivada"}` });
    logAction({ action: "toggle_status", entity_type: "company", entity_id: company.id, entity_title: company.name, details: { new_status: newStatus } });
    void fetchCompanies();
  };

  const handleDelete = async (company: CompanyRow) => {
    if (company.users_count > 0 || company.documents_count > 0) {
      toast({
        title: "No se puede eliminar",
        description: `La empresa tiene ${company.users_count} usuario(s) y ${company.documents_count} documento(s) asociados. Desactívala en su lugar.`,
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`¿Seguro que quieres eliminar la empresa "${company.name}"? Esta acción no se puede deshacer.`)) return;

    const { error } = await (supabase as any).from("companies").delete().eq("id", company.id);
    if (error) {
      toast({ title: "Error eliminando empresa", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Empresa eliminada" });
    logAction({ action: "delete", entity_type: "company", entity_id: company.id, entity_title: company.name });
    void fetchCompanies();
  };

  if (!isSuperadmin) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <p className="text-muted-foreground">Solo el superadministrador puede gestionar empresas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-accent" />
            <div>
              <h3 className="font-semibold text-foreground">Gestión de Empresas</h3>
              <p className="text-sm text-muted-foreground">
                Administra todas las empresas (tenants) de la plataforma.
              </p>
            </div>
          </div>
          <Button variant="accent" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva empresa
          </Button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground animate-pulse">Cargando empresas...</div>
        ) : companies.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No hay empresas registradas.</div>
        ) : (
          <div className="space-y-3">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{company.name}</p>
                    <Badge variant={company.status === "active" ? "default" : "secondary"}>
                      {STATUS_LABELS[company.status] ?? company.status}
                    </Badge>
                    <Badge variant="outline">{PLAN_LABELS[company.plan_type] ?? company.plan_type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Slug: <span className="font-mono">{company.slug}</span> · Creada:{" "}
                    {new Date(company.created_at).toLocaleDateString("es-ES")}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {company.users_count} usuarios
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {company.documents_count} documentos
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleOpenEdit(company)}>
                    <Pencil className="w-3 h-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleStatus(company)}
                  >
                    <Power className="w-3 h-3 mr-1" />
                    {company.status === "active" ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(company)}
                    disabled={company.users_count > 0 || company.documents_count > 0}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
            </div>
            {!editingCompany && (
              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">Administrador de la empresa</p>
                <div className="space-y-2">
                  <Label>Email del administrador</Label>
                  <Input
                    type="email"
                    value={form.admin_email}
                    onChange={(e) => setForm((prev) => ({ ...prev, admin_email: e.target.value }))}
                    placeholder="admin@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contraseña</Label>
                  <Input
                    type="password"
                    value={form.admin_password}
                    onChange={(e) => setForm((prev) => ({ ...prev, admin_password: e.target.value }))}
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
              </div>
            )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
            <DialogDescription>
              {editingCompany
                ? "Modifica los datos de la empresa seleccionada."
                : "Crea una nueva empresa (tenant) en la plataforma."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la empresa</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name,
                    slug: editingCompany ? prev.slug : generateSlug(name),
                  }));
                }}
                placeholder="Mi Empresa S.L."
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (identificador URL)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="mi-empresa"
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm((prev) => ({ ...prev, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="inactive">Inactiva</SelectItem>
                    <SelectItem value="suspended">Suspendida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={form.plan_type} onValueChange={(v) => setForm((prev) => ({ ...prev, plan_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Estándar</SelectItem>
                    <SelectItem value="professional">Profesional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="accent" onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
