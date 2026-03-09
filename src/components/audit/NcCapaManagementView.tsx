import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, AlertCircle, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuditLog } from "@/hooks/useAuditLog";

type CapaPlan = {
  id: string;
  audit_id: string | null;
  company_id: string | null;
  title: string | null;
  description: string | null;
  responsible_id: string | null;
};
type NonConformity = {
  id: string;
  capa_plan_id: string;
  title: string;
  description: string | null;
  severity: string | null;
  root_cause: string | null;
  status: string;
  deadline: string | null;
  responsible_id: string | null;
};
type ActionItem = {
  id: string;
  non_conformity_id: string;
  action_type: "corrective" | "preventive" | "immediate";
  description: string;
  responsible_id: string | null;
  due_date: string | null;
  status: string;
};
type Profile = { id: string; full_name: string | null; email: string | null };
type Audit = { id: string; title: string };
type IncidenciaRef = { id: string; title: string; status: string };
type CapaIncidenciaLink = { capa_plan_id: string; incidencia_id: string };

interface NcCapaManagementViewProps {
  searchQuery?: string;
}

const actionStatus = ["open", "in_progress", "closed"] as const;
const actionTypes = [
  { value: "immediate", label: "Inmediata" },
  { value: "corrective", label: "Correctiva" },
  { value: "preventive", label: "Preventiva" },
] as const;

export function NcCapaManagementView({ searchQuery = "" }: NcCapaManagementViewProps) {
  const [capaPlans, setCapaPlans] = useState<CapaPlan[]>([]);
  const [nonConformities, setNonConformities] = useState<NonConformity[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [incidencias, setIncidencias] = useState<IncidenciaRef[]>([]);
  const [capaIncidenciaLinks, setCapaIncidenciaLinks] = useState<CapaIncidenciaLink[]>([]);
  const [selectedCapaPlanId, setSelectedCapaPlanId] = useState<string | null>(null);
  const [selectedNcId, setSelectedNcId] = useState<string | null>(null);
  const { canEditContent, canManageCompany } = usePermissions();
  const { logAction } = useAuditLog();

  // Dialog states
  const [newCapaOpen, setNewCapaOpen] = useState(false);
  const [editCapaOpen, setEditCapaOpen] = useState(false);
  const [newNcOpen, setNewNcOpen] = useState(false);
  const [editNcOpen, setEditNcOpen] = useState(false);
  const [newActionOpen, setNewActionOpen] = useState(false);
  const [editActionOpen, setEditActionOpen] = useState(false);
  const [linkIncidenciaOpen, setLinkIncidenciaOpen] = useState(false);
  const [linkAuditOpen, setLinkAuditOpen] = useState(false);

  // Forms
  const [capaForm, setCapaForm] = useState({ title: "", description: "", responsible_id: "", audit_id: "" });
  const [ncForm, setNcForm] = useState({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "", responsible_id: "" });
  const [actionForm, setActionForm] = useState({
    non_conformity_id: "",
    action_type: "corrective" as "corrective" | "preventive" | "immediate",
    description: "",
    responsible_id: "",
    due_date: "",
    status: "open",
  });
  const [editingCapa, setEditingCapa] = useState<CapaPlan | null>(null);
  const [editingNc, setEditingNc] = useState<NonConformity | null>(null);
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const normalizeText = (value: string | null | undefined) =>
    (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const normalizedQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const selectedCapaPlan = useMemo(() => capaPlans.find((p) => p.id === selectedCapaPlanId) ?? null, [capaPlans, selectedCapaPlanId]);
  const filteredNcs = useMemo(() => nonConformities.filter((nc) => nc.capa_plan_id === selectedCapaPlanId), [nonConformities, selectedCapaPlanId]);
  const selectedNc = useMemo(() => nonConformities.find((nc) => nc.id === selectedNcId) ?? null, [nonConformities, selectedNcId]);
  const ncActions = useMemo(() => actions.filter((a) => a.non_conformity_id === selectedNcId), [actions, selectedNcId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [{ data: capaData }, { data: ncData }, { data: actionData }, { data: usersData }, { data: auditsData }, { data: incData }, { data: linksData }] = await Promise.all([
        (supabase as any).from("capa_plans").select("id,audit_id,company_id,title,description,responsible_id").order("created_at", { ascending: false }),
        (supabase as any).from("non_conformities").select("id,capa_plan_id,title,description,severity,root_cause,status,deadline,responsible_id"),
        (supabase as any).from("actions").select("id,non_conformity_id,action_type,description,responsible_id,due_date,status"),
        (supabase as any).from("profiles").select("id,full_name,email"),
        (supabase as any).from("audits").select("id,title"),
        (supabase as any).from("incidencias").select("id,title,status"),
        (supabase as any).from("incidencia_capa_plans").select("incidencia_id,capa_plan_id"),
      ]);
      setCapaPlans((capaData ?? []) as CapaPlan[]);
      setNonConformities((ncData ?? []) as NonConformity[]);
      setActions((actionData ?? []) as ActionItem[]);
      setUsers((usersData ?? []) as Profile[]);
      setAudits((auditsData ?? []) as Audit[]);
      setIncidencias((incData ?? []) as IncidenciaRef[]);
      setCapaIncidenciaLinks((linksData ?? []) as CapaIncidenciaLink[]);
      if (!selectedCapaPlanId && capaData?.[0]?.id) setSelectedCapaPlanId(capaData[0].id);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  // Auto-select first NC when CAPA changes
  useEffect(() => {
    if (filteredNcs.length > 0 && !filteredNcs.some(nc => nc.id === selectedNcId)) {
      setSelectedNcId(filteredNcs[0].id);
    } else if (filteredNcs.length === 0) {
      setSelectedNcId(null);
    }
  }, [filteredNcs, selectedNcId]);

  const getUserName = (id: string | null) => {
    if (!id) return null;
    const u = users.find((u) => u.id === id);
    return u ? (u.full_name ?? u.email ?? id) : null;
  };

  const getAuditTitle = (id: string | null) => {
    if (!id) return null;
    return audits.find((a) => a.id === id)?.title ?? null;
  };

  const capaPlansFiltered = useMemo(() => {
    if (!normalizedQuery) return capaPlans;
    return capaPlans.filter((plan) => {
      const relatedNcs = nonConformities.filter((nc) => nc.capa_plan_id === plan.id);
      const searchFields = [
        plan.title,
        plan.description,
        getUserName(plan.responsible_id),
        getAuditTitle(plan.audit_id),
        ...relatedNcs.map((nc) => nc.title),
        ...relatedNcs.map((nc) => nc.description),
      ];
      return searchFields.some((field) => normalizeText(field).includes(normalizedQuery));
    });
  }, [capaPlans, nonConformities, normalizedQuery, users, audits]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(capaPlansFiltered.length / PAGE_SIZE));
  const paginatedCapaPlans = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return capaPlansFiltered.slice(start, start + PAGE_SIZE);
  }, [capaPlansFiltered, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [normalizedQuery]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  // --- CRUD ---
  const createCapaPlan = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      toast({ title: "Error", description: "Debes iniciar sesión.", variant: "destructive" });
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } = await (supabase as any)
      .from("capa_plans")
      .insert({
        title: capaForm.title || "Plan CAPA",
        description: capaForm.description || null,
        responsible_id: capaForm.responsible_id || null,
        audit_id: capaForm.audit_id || null,
        company_id: profileData?.company_id,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Plan CAPA creado" });
    logAction({ action: "create", entity_type: "capa_plan", entity_id: data?.id, entity_title: capaForm.title });
    setNewCapaOpen(false);
    setCapaForm({ title: "", description: "", responsible_id: "", audit_id: "" });
    await loadData();
    setSelectedCapaPlanId(data?.id);
  };

  const updateCapaPlan = async () => {
    if (!editingCapa) return;

    const { error } = await (supabase as any)
      .from("capa_plans")
      .update({
        title: capaForm.title || null,
        description: capaForm.description || null,
        responsible_id: capaForm.responsible_id || null,
        audit_id: capaForm.audit_id || null,
      })
      .eq("id", editingCapa.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Plan CAPA actualizado" });
    logAction({ action: "update", entity_type: "capa_plan", entity_id: editingCapa.id, entity_title: capaForm.title });
    setEditCapaOpen(false);
    setEditingCapa(null);
    await loadData();
  };

  const createNc = async () => {
    if (!selectedCapaPlanId) return;
    if (!ncForm.responsible_id || !ncForm.deadline) {
      toast({ title: "Error", description: "Responsable y fecha límite son obligatorios.", variant: "destructive" });
      return;
    }

    const { data, error } = await (supabase as any)
      .from("non_conformities")
      .insert({
        capa_plan_id: selectedCapaPlanId,
        title: ncForm.title,
        description: ncForm.description || null,
        severity: ncForm.severity || null,
        root_cause: ncForm.root_cause || null,
        status: ncForm.status,
        deadline: ncForm.deadline,
        responsible_id: ncForm.responsible_id,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "No conformidad creada" });
    logAction({ action: "create", entity_type: "non_conformity", entity_id: data?.id, entity_title: ncForm.title });
    setNewNcOpen(false);
    setNcForm({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "", responsible_id: "" });
    await loadData();
  };

  const updateNc = async () => {
    if (!editingNc) return;
    if (!ncForm.responsible_id || !ncForm.deadline) {
      toast({ title: "Error", description: "Responsable y fecha límite son obligatorios.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any)
      .from("non_conformities")
      .update({
        title: ncForm.title,
        description: ncForm.description || null,
        severity: ncForm.severity || null,
        root_cause: ncForm.root_cause || null,
        status: ncForm.status,
        deadline: ncForm.deadline,
        responsible_id: ncForm.responsible_id,
      })
      .eq("id", editingNc.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "No conformidad actualizada" });
    logAction({ action: "update", entity_type: "non_conformity", entity_id: editingNc.id, entity_title: ncForm.title });
    setEditNcOpen(false);
    setEditingNc(null);
    await loadData();
  };

  const createAction = async () => {
    if (!selectedNcId) return;
    if (!actionForm.responsible_id || !actionForm.due_date) {
      toast({ title: "Error", description: "Responsable y fecha son obligatorios.", variant: "destructive" });
      return;
    }

    const { data, error } = await (supabase as any)
      .from("actions")
      .insert({
        non_conformity_id: selectedNcId,
        action_type: actionForm.action_type,
        description: actionForm.description,
        responsible_id: actionForm.responsible_id,
        due_date: actionForm.due_date,
        status: actionForm.status,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Acción creada" });
    logAction({ action: "create", entity_type: "action", entity_id: data?.id, entity_title: actionForm.description.slice(0, 50) });
    setNewActionOpen(false);
    setActionForm({ non_conformity_id: "", action_type: "corrective", description: "", responsible_id: "", due_date: "", status: "open" });
    await loadData();
  };

  const updateAction = async () => {
    if (!editingAction) return;

    // Check if user is the responsible
    if (editingAction.responsible_id !== currentUserId) {
      toast({ title: "Sin permisos", description: "Solo el responsable puede modificar esta acción.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any)
      .from("actions")
      .update({
        action_type: actionForm.action_type,
        description: actionForm.description,
        responsible_id: actionForm.responsible_id,
        due_date: actionForm.due_date,
        status: actionForm.status,
      })
      .eq("id", editingAction.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Acción actualizada" });
    logAction({ action: "update", entity_type: "action", entity_id: editingAction.id, entity_title: actionForm.description.slice(0, 50) });
    setEditActionOpen(false);
    setEditingAction(null);
    await loadData();
  };

  const linkIncidencia = async (incidenciaId: string) => {
    if (!selectedCapaPlanId) return;

    const { error } = await (supabase as any)
      .from("incidencia_capa_plans")
      .insert({ incidencia_id: incidenciaId, capa_plan_id: selectedCapaPlanId });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Incidencia vinculada" });
    setLinkIncidenciaOpen(false);
    await loadData();
  };

  const unlinkIncidencia = async (incidenciaId: string) => {
    if (!selectedCapaPlanId) return;

    const { error } = await (supabase as any)
      .from("incidencia_capa_plans")
      .delete()
      .eq("incidencia_id", incidenciaId)
      .eq("capa_plan_id", selectedCapaPlanId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Incidencia desvinculada" });
    await loadData();
  };

  const linkedIncidencias = useMemo(() => {
    if (!selectedCapaPlanId) return [];
    const linkedIds = capaIncidenciaLinks.filter((l) => l.capa_plan_id === selectedCapaPlanId).map((l) => l.incidencia_id);
    return incidencias.filter((i) => linkedIds.includes(i.id));
  }, [selectedCapaPlanId, capaIncidenciaLinks, incidencias]);

  const availableIncidencias = useMemo(() => {
    const linkedIds = capaIncidenciaLinks.filter((l) => l.capa_plan_id === selectedCapaPlanId).map((l) => l.incidencia_id);
    return incidencias.filter((i) => !linkedIds.includes(i.id));
  }, [selectedCapaPlanId, capaIncidenciaLinks, incidencias]);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { open: "Abierta", in_progress: "En proceso", closed: "Cerrada" };
    return map[s] ?? s;
  };

  const actionTypeLabel = (t: string) => actionTypes.find((at) => at.value === t)?.label ?? t;

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const openEditCapa = (capa: CapaPlan) => {
    setEditingCapa(capa);
    setCapaForm({
      title: capa.title ?? "",
      description: capa.description ?? "",
      responsible_id: capa.responsible_id ?? "",
      audit_id: capa.audit_id ?? "",
    });
    setEditCapaOpen(true);
  };

  const openEditNc = (nc: NonConformity) => {
    setEditingNc(nc);
    setNcForm({
      title: nc.title,
      description: nc.description ?? "",
      severity: nc.severity ?? "",
      root_cause: nc.root_cause ?? "",
      status: nc.status,
      deadline: nc.deadline ?? "",
      responsible_id: nc.responsible_id ?? "",
    });
    setEditNcOpen(true);
  };

  const openEditAction = (action: ActionItem) => {
    setEditingAction(action);
    setActionForm({
      non_conformity_id: action.non_conformity_id,
      action_type: action.action_type,
      description: action.description,
      responsible_id: action.responsible_id ?? "",
      due_date: action.due_date ?? "",
      status: action.status,
    });
    setEditActionOpen(true);
  };

  // Count stats for a CAPA plan
  const getCapaStats = (capaId: string) => {
    const ncs = nonConformities.filter((nc) => nc.capa_plan_id === capaId);
    const ncActions = actions.filter((a) => ncs.some((nc) => nc.id === a.non_conformity_id));
    const openNcs = ncs.filter((nc) => nc.status === "open" || nc.status === "in_progress").length;
    const openActions = ncActions.filter((a) => a.status === "open" || a.status === "in_progress").length;
    return { ncs: ncs.length, openNcs, actions: ncActions.length, openActions };
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* CAPA Plans list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Planes CAPA</CardTitle>
          {canEditContent && (
            <Button size="sm" onClick={() => { setCapaForm({ title: "", description: "", responsible_id: "", audit_id: "" }); setNewCapaOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />Nuevo
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}

          {!isLoading && paginatedCapaPlans.map((capa) => {
            const stats = getCapaStats(capa.id);
            return (
              <button
                key={capa.id}
                onClick={() => setSelectedCapaPlanId(capa.id)}
                className={`w-full rounded border p-3 text-left ${selectedCapaPlanId === capa.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <p className="font-medium">{capa.title || "Sin título"}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{stats.ncs} NC{stats.ncs !== 1 ? "s" : ""}</span>
                  {stats.openNcs > 0 && <Badge variant="outline" className="text-xs">{stats.openNcs} abierta{stats.openNcs !== 1 ? "s" : ""}</Badge>}
                </div>
                {capa.audit_id && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    🔗 {getAuditTitle(capa.audit_id)}
                  </p>
                )}
              </button>
            );
          })}

          {!isLoading && capaPlansFiltered.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay planes CAPA.</p>
          )}

          {!isLoading && capaPlansFiltered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>Página {currentPage} de {totalPages}</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                <Button type="button" size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* CAPA Plan details */}
        {selectedCapaPlan && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{selectedCapaPlan.title || "Plan CAPA"}</CardTitle>
              <div className="flex gap-2">
                {canEditContent && (
                  <Button size="sm" variant="outline" onClick={() => openEditCapa(selectedCapaPlan)}>
                    <Pencil className="mr-1 h-4 w-4" />Editar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Descripción</p>
                  <p>{selectedCapaPlan.description || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Responsable</p>
                  <p>{getUserName(selectedCapaPlan.responsible_id) || "—"}</p>
                </div>
                {selectedCapaPlan.audit_id && (
                  <div>
                    <p className="text-sm text-muted-foreground">Auditoría vinculada</p>
                    <p className="text-blue-600 dark:text-blue-400">{getAuditTitle(selectedCapaPlan.audit_id)}</p>
                  </div>
                )}
              </div>

              {/* Linked incidencias */}
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Incidencias vinculadas</p>
                  {canEditContent && (
                    <Button size="sm" variant="outline" onClick={() => setLinkIncidenciaOpen(true)}>
                      <Link2 className="mr-1 h-4 w-4" />Vincular
                    </Button>
                  )}
                </div>
                {linkedIncidencias.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay incidencias vinculadas.</p>
                ) : (
                  <div className="space-y-1">
                    {linkedIncidencias.map((inc) => (
                      <div key={inc.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                        <span>{inc.title}</span>
                        {canEditContent && (
                          <Button size="sm" variant="ghost" onClick={() => unlinkIncidencia(inc.id)}>
                            <Unlink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Conformities */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>No Conformidades</CardTitle>
            {canEditContent && selectedCapaPlanId && (
              <Button size="sm" onClick={() => { setNcForm({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "", responsible_id: "" }); setNewNcOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" />Nueva NC
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {filteredNcs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay no conformidades en este plan.</p>
            ) : (
              <div className="space-y-2">
                {filteredNcs.map((nc) => {
                  const ncActs = actions.filter((a) => a.non_conformity_id === nc.id);
                  const openActions = ncActs.filter((a) => a.status !== "closed").length;
                  const overdueActions = ncActs.filter((a) => a.status !== "closed" && isOverdue(a.due_date)).length;
                  
                  return (
                    <button
                      key={nc.id}
                      onClick={() => setSelectedNcId(nc.id)}
                      className={`w-full rounded border p-3 text-left ${selectedNcId === nc.id ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{nc.title}</p>
                        <Badge variant={nc.status === "closed" ? "secondary" : nc.status === "in_progress" ? "default" : "outline"}>
                          {statusLabel(nc.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{ncActs.length} acción{ncActs.length !== 1 ? "es" : ""}</span>
                        {openActions > 0 && <Badge variant="outline">{openActions} pendiente{openActions !== 1 ? "s" : ""}</Badge>}
                        {overdueActions > 0 && <Badge variant="destructive">{overdueActions} vencida{overdueActions !== 1 ? "s" : ""}</Badge>}
                        {nc.deadline && (
                          <span className={isOverdue(nc.deadline) && nc.status !== "closed" ? "text-destructive" : ""}>
                            Límite: {nc.deadline}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions for selected NC */}
        {selectedNc && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Acciones CAPA</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">NC: {selectedNc.title}</p>
              </div>
              <div className="flex gap-2">
                {canEditContent && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openEditNc(selectedNc)}>
                      <Pencil className="mr-1 h-4 w-4" />Editar NC
                    </Button>
                    <Button size="sm" onClick={() => { setActionForm({ non_conformity_id: selectedNcId!, action_type: "corrective", description: "", responsible_id: "", due_date: "", status: "open" }); setNewActionOpen(true); }}>
                      <Plus className="mr-1 h-4 w-4" />Nueva Acción
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {ncActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay acciones para esta NC.</p>
              ) : (
                <div className="space-y-2">
                  {ncActions.map((action) => (
                    <div key={action.id} className="border rounded p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{actionTypeLabel(action.action_type)}</Badge>
                          <Badge variant={action.status === "closed" ? "secondary" : action.status === "in_progress" ? "default" : "outline"}>
                            {statusLabel(action.status)}
                          </Badge>
                        </div>
                        {action.responsible_id === currentUserId && (
                          <Button size="sm" variant="ghost" onClick={() => openEditAction(action)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 text-sm">{action.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Responsable: {getUserName(action.responsible_id) || "—"}</span>
                        {action.due_date && (
                          <span className={isOverdue(action.due_date) && action.status !== "closed" ? "text-destructive flex items-center gap-1" : ""}>
                            {isOverdue(action.due_date) && action.status !== "closed" && <AlertCircle className="h-3 w-3" />}
                            Vence: {action.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* New CAPA Dialog */}
      <Dialog open={newCapaOpen} onOpenChange={setNewCapaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Plan CAPA</DialogTitle>
            <DialogDescription>Crea un plan CAPA independiente o vinculado a una auditoría.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre del plan</Label><Input value={capaForm.title} onChange={(e) => setCapaForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ej: Plan CAPA principal" /></div>
            <div><Label>Descripción</Label><Textarea value={capaForm.description} onChange={(e) => setCapaForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
            <div>
              <Label>Responsable</Label>
              <Select value={capaForm.responsible_id} onValueChange={(v) => setCapaForm((p) => ({ ...p, responsible_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vincular a auditoría (opcional)</Label>
              <Select value={capaForm.audit_id} onValueChange={(v) => setCapaForm((p) => ({ ...p, audit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Sin auditoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin auditoría</SelectItem>
                  {audits.map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCapaOpen(false)}>Cancelar</Button>
            <Button onClick={createCapaPlan}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit CAPA Dialog */}
      <Dialog open={editCapaOpen} onOpenChange={setEditCapaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Plan CAPA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre del plan</Label><Input value={capaForm.title} onChange={(e) => setCapaForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Descripción</Label><Textarea value={capaForm.description} onChange={(e) => setCapaForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
            <div>
              <Label>Responsable</Label>
              <Select value={capaForm.responsible_id} onValueChange={(v) => setCapaForm((p) => ({ ...p, responsible_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vincular a auditoría</Label>
              <Select value={capaForm.audit_id} onValueChange={(v) => setCapaForm((p) => ({ ...p, audit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Sin auditoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin auditoría</SelectItem>
                  {audits.map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCapaOpen(false)}>Cancelar</Button>
            <Button onClick={updateCapaPlan}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New NC Dialog */}
      <Dialog open={newNcOpen} onOpenChange={setNewNcOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva No Conformidad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Título *</Label><Input value={ncForm.title} onChange={(e) => setNcForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Descripción</Label><Textarea value={ncForm.description} onChange={(e) => setNcForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Severidad</Label><Input value={ncForm.severity} onChange={(e) => setNcForm((p) => ({ ...p, severity: e.target.value }))} placeholder="Ej: Mayor, Menor, Crítica" /></div>
            <div><Label>Causa raíz</Label><Textarea value={ncForm.root_cause} onChange={(e) => setNcForm((p) => ({ ...p, root_cause: e.target.value }))} /></div>
            <div>
              <Label>Responsable *</Label>
              <Select value={ncForm.responsible_id} onValueChange={(v) => setNcForm((p) => ({ ...p, responsible_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Fecha límite *</Label><Input type="date" value={ncForm.deadline} onChange={(e) => setNcForm((p) => ({ ...p, deadline: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewNcOpen(false)}>Cancelar</Button>
            <Button onClick={createNc}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit NC Dialog */}
      <Dialog open={editNcOpen} onOpenChange={setEditNcOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar No Conformidad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Título *</Label><Input value={ncForm.title} onChange={(e) => setNcForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Descripción</Label><Textarea value={ncForm.description} onChange={(e) => setNcForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Severidad</Label><Input value={ncForm.severity} onChange={(e) => setNcForm((p) => ({ ...p, severity: e.target.value }))} /></div>
            <div><Label>Causa raíz</Label><Textarea value={ncForm.root_cause} onChange={(e) => setNcForm((p) => ({ ...p, root_cause: e.target.value }))} /></div>
            <div>
              <Label>Responsable *</Label>
              <Select value={ncForm.responsible_id} onValueChange={(v) => setNcForm((p) => ({ ...p, responsible_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Fecha límite *</Label><Input type="date" value={ncForm.deadline} onChange={(e) => setNcForm((p) => ({ ...p, deadline: e.target.value }))} /></div>
            <div>
              <Label>Estado</Label>
              <Select value={ncForm.status} onValueChange={(v) => setNcForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{actionStatus.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNcOpen(false)}>Cancelar</Button>
            <Button onClick={updateNc}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Action Dialog */}
      <Dialog open={newActionOpen} onOpenChange={setNewActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Acción CAPA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={actionForm.action_type} onValueChange={(v: "corrective" | "preventive" | "immediate") => setActionForm((p) => ({ ...p, action_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{actionTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Descripción *</Label><Textarea value={actionForm.description} onChange={(e) => setActionForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div>
              <Label>Responsable *</Label>
              <Select value={actionForm.responsible_id} onValueChange={(v) => setActionForm((p) => ({ ...p, responsible_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Fecha vencimiento *</Label><Input type="date" value={actionForm.due_date} onChange={(e) => setActionForm((p) => ({ ...p, due_date: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewActionOpen(false)}>Cancelar</Button>
            <Button onClick={createAction}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action Dialog */}
      <Dialog open={editActionOpen} onOpenChange={setEditActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Acción CAPA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={actionForm.action_type} onValueChange={(v: "corrective" | "preventive" | "immediate") => setActionForm((p) => ({ ...p, action_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{actionTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Descripción *</Label><Textarea value={actionForm.description} onChange={(e) => setActionForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div>
              <Label>Responsable *</Label>
              <Select value={actionForm.responsible_id} onValueChange={(v) => setActionForm((p) => ({ ...p, responsible_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Fecha vencimiento *</Label><Input type="date" value={actionForm.due_date} onChange={(e) => setActionForm((p) => ({ ...p, due_date: e.target.value }))} /></div>
            <div>
              <Label>Estado</Label>
              <Select value={actionForm.status} onValueChange={(v) => setActionForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{actionStatus.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditActionOpen(false)}>Cancelar</Button>
            <Button onClick={updateAction}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Incidencia Dialog */}
      <Dialog open={linkIncidenciaOpen} onOpenChange={setLinkIncidenciaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular Incidencia</DialogTitle>
            <DialogDescription>Selecciona una incidencia para vincular a este plan CAPA.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {availableIncidencias.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay incidencias disponibles.</p>
            ) : (
              availableIncidencias.map((inc) => (
                <button
                  key={inc.id}
                  onClick={() => linkIncidencia(inc.id)}
                  className="w-full rounded border p-3 text-left hover:bg-muted"
                >
                  <p className="font-medium">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">{statusLabel(inc.status)}</p>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkIncidenciaOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
