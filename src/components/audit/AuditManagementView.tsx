import { useEffect, useMemo, useState } from "react";
import { Plus, Paperclip, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

type Audit = { id: string; title: string; description: string | null; audit_date: string | null; auditor_id: string | null };
type CapaPlan = { id: string; audit_id: string; title: string | null; description: string | null; responsible_id: string | null };
type NonConformity = { id: string; capa_plan_id: string; title: string; description: string | null; severity: string | null; root_cause: string | null; status: string; deadline: string | null };
type ActionItem = { id: string; non_conformity_id: string; action_type: "corrective" | "preventive" | "immediate"; description: string; responsible_id: string | null; due_date: string | null; status: string };
type Profile = { id: string; full_name: string | null; email: string | null };

const actionStatus = ["open", "in_progress", "closed", "overdue"] as const;
const actionTypes = [
  { value: "immediate", label: "Inmediata" },
  { value: "corrective", label: "Correctiva" },
  { value: "preventive", label: "Preventiva" },
] as const;

export function AuditManagementView() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [capaPlans, setCapaPlans] = useState<CapaPlan[]>([]);
  const [nonConformities, setNonConformities] = useState<NonConformity[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [selectedCapaPlanId, setSelectedCapaPlanId] = useState<string | null>(null);
  const { canEditContent } = usePermissions();

  // Dialog states
  const [newAuditOpen, setNewAuditOpen] = useState(false);
  const [newCapaOpen, setNewCapaOpen] = useState(false);
  const [newNcOpen, setNewNcOpen] = useState(false);
  const [newActionOpen, setNewActionOpen] = useState(false);
  const [editCapaOpen, setEditCapaOpen] = useState(false);
  const [editNcOpen, setEditNcOpen] = useState(false);
  const [editActionOpen, setEditActionOpen] = useState(false);

  // Forms
  const [auditForm, setAuditForm] = useState({ title: "", description: "", audit_date: "" });
  const [capaForm, setCapaForm] = useState({ title: "", description: "", responsible_id: "" });
  const [ncForm, setNcForm] = useState({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "" });
  const [actionForm, setActionForm] = useState({
    non_conformity_id: "", action_type: "corrective" as "corrective" | "preventive" | "immediate",
    description: "", responsible_id: "", due_date: "", status: "open", file: null as File | null,
  });
  const [editingNc, setEditingNc] = useState<NonConformity | null>(null);
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null);
  const [editingCapa, setEditingCapa] = useState<CapaPlan | null>(null);

  const { toast } = useToast();

  const auditCapaPlans = useMemo(() => capaPlans.filter((p) => p.audit_id === selectedAuditId), [capaPlans, selectedAuditId]);
  const selectedCapaPlan = useMemo(() => capaPlans.find((p) => p.id === selectedCapaPlanId) ?? null, [capaPlans, selectedCapaPlanId]);
  const filteredNcs = useMemo(() => nonConformities.filter((nc) => nc.capa_plan_id === selectedCapaPlanId), [nonConformities, selectedCapaPlanId]);

  // Auto-select first CAPA plan when audit changes
  useEffect(() => {
    if (auditCapaPlans.length > 0) {
      setSelectedCapaPlanId(auditCapaPlans[0].id);
    } else {
      setSelectedCapaPlanId(null);
    }
  }, [selectedAuditId, auditCapaPlans.length]);

  const loadData = async () => {
    const [{ data: auditsData }, { data: capaData }, { data: ncData }, { data: actionData }, { data: usersData }] = await Promise.all([
      (supabase as any).from("audits").select("id,title,description,audit_date,auditor_id").order("created_at", { ascending: false }),
      (supabase as any).from("capa_plans").select("id,audit_id,title,description,responsible_id"),
      (supabase as any).from("non_conformities").select("id,capa_plan_id,title,description,severity,root_cause,status,deadline"),
      (supabase as any).from("actions").select("id,non_conformity_id,action_type,description,responsible_id,due_date,status"),
      (supabase as any).from("profiles").select("id,full_name,email"),
    ]);
    setAudits((auditsData ?? []) as Audit[]);
    setCapaPlans((capaData ?? []) as CapaPlan[]);
    setNonConformities((ncData ?? []) as NonConformity[]);
    setActions((actionData ?? []) as ActionItem[]);
    setUsers((usersData ?? []) as Profile[]);
    if (!selectedAuditId && auditsData?.[0]?.id) setSelectedAuditId(auditsData[0].id);
  };

  useEffect(() => { void loadData(); }, []);

  const selectedAudit = audits.find((a) => a.id === selectedAuditId) ?? null;

  const getUserName = (id: string | null) => {
    if (!id) return null;
    const u = users.find((u) => u.id === id);
    return u ? (u.full_name ?? u.email ?? id) : null;
  };

  // --- CRUD ---
  const createAudit = async () => {
    const { data: profileData } = await supabase.from("profiles").select("company_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
    const { error } = await (supabase as any).from("audits").insert({
      title: auditForm.title, description: auditForm.description || null, audit_date: auditForm.audit_date || null,
      company_id: profileData?.company_id, created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Auditoría creada" });
    setNewAuditOpen(false);
    setAuditForm({ title: "", description: "", audit_date: "" });
    await loadData();
  };

  const createCapaPlan = async () => {
    if (!selectedAuditId) return;
    const { error } = await (supabase as any).from("capa_plans").insert({
      audit_id: selectedAuditId,
      title: capaForm.title || null,
      description: capaForm.description || null,
      responsible_id: capaForm.responsible_id || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Plan CAPA creado" });
    setNewCapaOpen(false);
    setCapaForm({ title: "", description: "", responsible_id: "" });
    await loadData();
  };

  const updateCapaPlan = async () => {
    if (!editingCapa) return;
    const { error } = await (supabase as any).from("capa_plans").update({
      title: capaForm.title || null,
      description: capaForm.description || null,
      responsible_id: capaForm.responsible_id || null,
    }).eq("id", editingCapa.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Plan CAPA actualizado" });
    setEditCapaOpen(false);
    setEditingCapa(null);
    await loadData();
  };

  const createNonConformity = async () => {
    if (!selectedCapaPlanId || !ncForm.deadline) {
      toast({ title: "Error", description: "La fecha límite es obligatoria.", variant: "destructive" }); return;
    }
    const { data, error } = await (supabase as any).from("non_conformities").insert({
      capa_plan_id: selectedCapaPlanId, title: ncForm.title, description: ncForm.description || null,
      severity: ncForm.severity || null, root_cause: ncForm.root_cause || null, status: ncForm.status, deadline: ncForm.deadline,
    }).select("id").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await (supabase as any).from("actions").insert({
      non_conformity_id: data.id, action_type: "corrective", description: "Acción correctiva inicial", status: "open",
    });
    toast({ title: "No conformidad creada" });
    setNewNcOpen(false);
    setNcForm({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "" });
    await loadData();
  };

  const updateNonConformity = async () => {
    if (!editingNc) return;
    const { error } = await (supabase as any).from("non_conformities").update({
      title: ncForm.title, description: ncForm.description || null, severity: ncForm.severity || null,
      root_cause: ncForm.root_cause || null, status: ncForm.status, deadline: ncForm.deadline || null,
    }).eq("id", editingNc.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "No conformidad actualizada" });
    setEditNcOpen(false); setEditingNc(null);
    await loadData();
  };

  const createAction = async () => {
    const { data, error } = await (supabase as any).from("actions").insert({
      non_conformity_id: actionForm.non_conformity_id, action_type: actionForm.action_type,
      description: actionForm.description, responsible_id: actionForm.responsible_id || null,
      due_date: actionForm.due_date || null, status: actionForm.status,
    }).select("id").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (actionForm.file) {
      const ext = actionForm.file.name.split(".").pop();
      const filePath = `actions/${data.id}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from("documents").upload(filePath, actionForm.file, { upsert: false });
      if (!upload.error) {
        await (supabase as any).from("action_attachments").insert({ action_id: data.id, bucket_id: "documents", object_path: filePath });
      }
    }
    toast({ title: "Acción creada" });
    setNewActionOpen(false);
    setActionForm({ non_conformity_id: "", action_type: "corrective", description: "", responsible_id: "", due_date: "", status: "open", file: null });
    await loadData();
  };

  const updateAction = async () => {
    if (!editingAction) return;
    const { error } = await (supabase as any).from("actions").update({
      action_type: actionForm.action_type, description: actionForm.description,
      responsible_id: actionForm.responsible_id || null, due_date: actionForm.due_date || null, status: actionForm.status,
    }).eq("id", editingAction.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Acción actualizada" });
    setEditActionOpen(false); setEditingAction(null);
    await loadData();
  };

  const openEditNc = (nc: NonConformity) => {
    setEditingNc(nc);
    setNcForm({ title: nc.title, description: nc.description ?? "", severity: nc.severity ?? "", root_cause: nc.root_cause ?? "", status: nc.status, deadline: nc.deadline ?? "" });
    setEditNcOpen(true);
  };

  const openEditAction = (action: ActionItem) => {
    setEditingAction(action);
    setActionForm({
      non_conformity_id: action.non_conformity_id, action_type: action.action_type,
      description: action.description, responsible_id: action.responsible_id ?? "",
      due_date: action.due_date ?? "", status: action.status, file: null,
    });
    setEditActionOpen(true);
  };

  const openEditCapa = (capa: CapaPlan) => {
    setEditingCapa(capa);
    setCapaForm({ title: capa.title ?? "", description: capa.description ?? "", responsible_id: capa.responsible_id ?? "" });
    setEditCapaOpen(true);
  };

  // --- NC form fields ---
  const renderNcFields = () => (
    <div className="space-y-3">
      <div><Label>Título</Label><Input value={ncForm.title} onChange={(e) => setNcForm((p) => ({ ...p, title: e.target.value }))} /></div>
      <div><Label>Descripción</Label><Textarea value={ncForm.description} onChange={(e) => setNcForm((p) => ({ ...p, description: e.target.value }))} /></div>
      <div><Label>Severidad</Label><Input value={ncForm.severity} onChange={(e) => setNcForm((p) => ({ ...p, severity: e.target.value }))} /></div>
      <div><Label>Causa raíz</Label><Textarea value={ncForm.root_cause} onChange={(e) => setNcForm((p) => ({ ...p, root_cause: e.target.value }))} /></div>
      <div><Label>Fecha límite *</Label><Input type="date" value={ncForm.deadline} onChange={(e) => setNcForm((p) => ({ ...p, deadline: e.target.value }))} /></div>
      <div>
        <Label>Estado</Label>
        <Select value={ncForm.status} onValueChange={(v) => setNcForm((p) => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{actionStatus.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );

  // --- Action form fields ---
  const renderActionFields = (showNcSelect: boolean) => (
    <div className="space-y-3">
      {showNcSelect && (
        <div>
          <Label>No conformidad</Label>
          <Select value={actionForm.non_conformity_id} onValueChange={(v) => setActionForm((p) => ({ ...p, non_conformity_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecciona NC" /></SelectTrigger>
            <SelectContent>{filteredNcs.map((nc) => <SelectItem key={nc.id} value={nc.id}>{nc.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Tipo</Label>
        <Select value={actionForm.action_type} onValueChange={(v: "corrective" | "preventive" | "immediate") => setActionForm((p) => ({ ...p, action_type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{actionTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Descripción</Label><Textarea value={actionForm.description} onChange={(e) => setActionForm((p) => ({ ...p, description: e.target.value }))} /></div>
      <div>
        <Label>Responsable</Label>
        <Select value={actionForm.responsible_id} onValueChange={(v) => setActionForm((p) => ({ ...p, responsible_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Fecha vencimiento</Label><Input type="date" value={actionForm.due_date} onChange={(e) => setActionForm((p) => ({ ...p, due_date: e.target.value }))} /></div>
      <div>
        <Label>Estado</Label>
        <Select value={actionForm.status} onValueChange={(v) => setActionForm((p) => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{actionStatus.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {showNcSelect && (
        <div>
          <Label>Adjunto</Label>
          <Input type="file" onChange={(e) => setActionForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))} />
          {actionForm.file && <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" />{actionForm.file.name}</p>}
        </div>
      )}
    </div>
  );

  // --- CAPA form fields ---
  const renderCapaFields = () => (
    <div className="space-y-3">
      <div><Label>Nombre del plan</Label><Input value={capaForm.title} onChange={(e) => setCapaForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ej: Plan CAPA principal" /></div>
      <div><Label>Descripción</Label><Textarea value={capaForm.description} onChange={(e) => setCapaForm((p) => ({ ...p, description: e.target.value }))} rows={4} /></div>
      <div>
        <Label>Responsable</Label>
        <Select value={capaForm.responsible_id} onValueChange={(v) => setCapaForm((p) => ({ ...p, responsible_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );

  const actionTypeLabel = (t: string) => actionTypes.find((at) => at.value === t)?.label ?? t;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Audits list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Auditorías</CardTitle>
          <Button size="sm" onClick={() => setNewAuditOpen(true)}><Plus className="mr-1 h-4 w-4" />Nueva</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {audits.map((audit) => (
            <button key={audit.id} onClick={() => setSelectedAuditId(audit.id)} className={`w-full rounded border p-3 text-left ${selectedAuditId === audit.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <p className="font-medium">{audit.title}</p>
              <p className="text-xs text-muted-foreground">{audit.audit_date ?? "Sin fecha"}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Audit info */}
        <Card>
          <CardHeader><CardTitle>Información de auditoría</CardTitle></CardHeader>
          <CardContent>
            {selectedAudit ? (
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Título:</span> {selectedAudit.title}</p>
                <p><span className="font-medium">Fecha:</span> {selectedAudit.audit_date ?? "Sin fecha"}</p>
                <p><span className="font-medium">Descripción:</span> {selectedAudit.description ?? "Sin descripción"}</p>
              </div>
            ) : <p className="text-sm text-muted-foreground">Selecciona una auditoría.</p>}
          </CardContent>
        </Card>

        {/* CAPA Plans */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Planes CAPA</CardTitle>
            {canEditContent && selectedAuditId && (
              <Button size="sm" onClick={() => { setCapaForm({ title: "", description: "", responsible_id: "" }); setNewCapaOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" />Nuevo plan
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {auditCapaPlans.length === 0 && <p className="text-sm text-muted-foreground">No hay planes CAPA para esta auditoría.</p>}
            {auditCapaPlans.map((capa) => {
              const ncCount = nonConformities.filter((nc) => nc.capa_plan_id === capa.id).length;
              const actCount = actions.filter((a) => nonConformities.some((nc) => nc.capa_plan_id === capa.id && nc.id === a.non_conformity_id)).length;
              return (
                <div
                  key={capa.id}
                  onClick={() => setSelectedCapaPlanId(capa.id)}
                  className={`rounded border p-3 cursor-pointer ${selectedCapaPlanId === capa.id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{capa.title || "Plan CAPA"}</p>
                    {canEditContent && (
                      <button onClick={(e) => { e.stopPropagation(); openEditCapa(capa); }} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {capa.responsible_id && <p className="text-xs text-muted-foreground">Responsable: {getUserName(capa.responsible_id)}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{ncCount} NC · {actCount} acciones</p>
                  {capa.description && <p className="text-xs text-muted-foreground mt-1 truncate">{capa.description}</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Non-conformities */}
        {selectedCapaPlanId && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>No conformidades</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setNcForm({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "" }); setNewNcOpen(true); }}>Añadir NC</Button>
                <Button size="sm" onClick={() => { setActionForm({ non_conformity_id: "", action_type: "corrective", description: "", responsible_id: "", due_date: "", status: "open", file: null }); setNewActionOpen(true); }}>Añadir acción</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredNcs.map((nc) => (
                <div key={nc.id} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{nc.title}</p>
                      {canEditContent && <button onClick={() => openEditNc(nc)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {nc.deadline && <span>Límite: {nc.deadline}</span>}
                      <span>{nc.status}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{nc.description ?? "Sin descripción"}</p>
                  {nc.severity && <p className="text-xs text-muted-foreground mt-1">Severidad: {nc.severity}</p>}
                  <div className="mt-2 space-y-1">
                    {actions.filter((a) => a.non_conformity_id === nc.id).map((action) => (
                      <div key={action.id} className="rounded bg-muted/40 p-2 text-sm cursor-pointer hover:bg-muted/60 transition-colors" onClick={() => openEditAction(action)}>
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{actionTypeLabel(action.action_type)}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {action.due_date && <span>{action.due_date}</span>}
                            <span>{action.status}</span>
                            {canEditContent && <Pencil className="h-3 w-3" />}
                          </div>
                        </div>
                        <p>{action.description}</p>
                        {action.responsible_id && <p className="text-xs text-muted-foreground">Responsable: {getUserName(action.responsible_id) ?? action.responsible_id}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filteredNcs.length === 0 && <p className="text-sm text-muted-foreground">No hay no conformidades en este plan CAPA.</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* New Audit Dialog */}
      <Dialog open={newAuditOpen} onOpenChange={setNewAuditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva auditoría</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={auditForm.title} onChange={(e) => setAuditForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Fecha</Label><Input type="date" value={auditForm.audit_date} onChange={(e) => setAuditForm((p) => ({ ...p, audit_date: e.target.value }))} /></div>
            <div><Label>Descripción</Label><Textarea value={auditForm.description} onChange={(e) => setAuditForm((p) => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={createAudit}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New CAPA Plan Dialog */}
      <Dialog open={newCapaOpen} onOpenChange={setNewCapaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo plan CAPA</DialogTitle></DialogHeader>
          {renderCapaFields()}
          <DialogFooter><Button onClick={createCapaPlan}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit CAPA Dialog */}
      <Dialog open={editCapaOpen} onOpenChange={(o) => { setEditCapaOpen(o); if (!o) setEditingCapa(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar plan CAPA</DialogTitle></DialogHeader>
          {renderCapaFields()}
          <DialogFooter>
            {canEditContent ? <Button onClick={updateCapaPlan}>Guardar cambios</Button> : <p className="text-sm text-muted-foreground">Solo lectura</p>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New NC Dialog */}
      <Dialog open={newNcOpen} onOpenChange={setNewNcOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva no conformidad</DialogTitle></DialogHeader>
          {renderNcFields()}
          <DialogFooter><Button onClick={createNonConformity}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit NC Dialog */}
      <Dialog open={editNcOpen} onOpenChange={(o) => { setEditNcOpen(o); if (!o) setEditingNc(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar no conformidad</DialogTitle></DialogHeader>
          {renderNcFields()}
          <DialogFooter>
            {canEditContent ? <Button onClick={updateNonConformity}>Guardar cambios</Button> : <p className="text-sm text-muted-foreground">Solo lectura</p>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Action Dialog */}
      <Dialog open={newActionOpen} onOpenChange={setNewActionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva acción</DialogTitle></DialogHeader>
          {renderActionFields(true)}
          <DialogFooter><Button onClick={createAction}>Guardar acción</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action Dialog */}
      <Dialog open={editActionOpen} onOpenChange={(o) => { setEditActionOpen(o); if (!o) setEditingAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar acción</DialogTitle>
            {editingAction && <DialogDescription>Vinculada a NC: {nonConformities.find((nc) => nc.id === editingAction.non_conformity_id)?.title ?? "—"}</DialogDescription>}
          </DialogHeader>
          {renderActionFields(false)}
          <DialogFooter>
            {canEditContent ? <Button onClick={updateAction}>Guardar cambios</Button> : <p className="text-sm text-muted-foreground">Solo lectura</p>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
