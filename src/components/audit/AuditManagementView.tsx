import { useEffect, useMemo, useState } from "react";
import { Plus, Paperclip, Pencil, AlertCircle, X, Trash2, Upload, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

type Audit = {
  id: string; title: string; description: string | null; audit_date: string | null;
  auditor_id: string | null; responsible_id: string | null; observations: string | null;
  findings: string | null; conclusions: string | null; status: string;
};
type AuditAttachment = { id: string; audit_id: string; file_name: string | null; object_path: string; file_type: string | null };
type AuditParticipant = { id: string; audit_id: string; user_id: string };
type CapaPlan = { id: string; audit_id: string; title: string | null; description: string | null; responsible_id: string | null };
type NonConformity = { id: string; capa_plan_id: string; title: string; description: string | null; severity: string | null; root_cause: string | null; status: string; deadline: string | null; responsible_id: string | null };
type ActionItem = { id: string; non_conformity_id: string; action_type: "corrective" | "preventive" | "immediate"; description: string; responsible_id: string | null; due_date: string | null; status: string };
type Profile = { id: string; full_name: string | null; email: string | null };
type IncidenciaRef = { id: string; title: string; status: string };
type CapaIncidenciaLink = { capa_plan_id: string; incidencia_id: string };

interface AuditManagementViewProps {
  searchQuery?: string;
}

const actionStatus = ["open", "in_progress", "closed"] as const;
const actionTypes = [
  { value: "immediate", label: "Inmediata" },
  { value: "corrective", label: "Correctiva" },
  { value: "preventive", label: "Preventiva" },
] as const;

export function AuditManagementView({ searchQuery = "" }: AuditManagementViewProps) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [auditAttachments, setAuditAttachments] = useState<AuditAttachment[]>([]);
  const [auditParticipants, setAuditParticipants] = useState<AuditParticipant[]>([]);
  const [capaPlans, setCapaPlans] = useState<CapaPlan[]>([]);
  const [nonConformities, setNonConformities] = useState<NonConformity[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [incidencias, setIncidencias] = useState<IncidenciaRef[]>([]);
  const [capaIncidenciaLinks, setCapaIncidenciaLinks] = useState<CapaIncidenciaLink[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [selectedCapaPlanId, setSelectedCapaPlanId] = useState<string | null>(null);
  const [linkIncidenciaOpen, setLinkIncidenciaOpen] = useState(false);
  const [linkingCapaPlanId, setLinkingCapaPlanId] = useState<string | null>(null);
  const { canEditContent, canManageCompany } = usePermissions();

  // Dialog states
  const [newAuditOpen, setNewAuditOpen] = useState(false);
  const [editAuditOpen, setEditAuditOpen] = useState(false);
  const [deleteAuditConfirmOpen, setDeleteAuditConfirmOpen] = useState(false);
  const [deletingAuditId, setDeletingAuditId] = useState<string | null>(null);
  const [auditLinkedInfo, setAuditLinkedInfo] = useState<string[]>([]);
  const [newCapaOpen, setNewCapaOpen] = useState(false);
  const [newNcOpen, setNewNcOpen] = useState(false);
  const [newActionOpen, setNewActionOpen] = useState(false);
  const [editCapaOpen, setEditCapaOpen] = useState(false);
  const [editNcOpen, setEditNcOpen] = useState(false);
  const [editActionOpen, setEditActionOpen] = useState(false);

  // Forms
  const [auditForm, setAuditForm] = useState({
    title: "", description: "", audit_date: "", auditor_id: "", responsible_id: "",
    observations: "", findings: "", conclusions: "", status: "open",
    participant_ids: [] as string[],
  });
  const [auditFiles, setAuditFiles] = useState<FileList | null>(null);
  const [capaForm, setCapaForm] = useState({ title: "", description: "", responsible_id: "" });
  const [ncForm, setNcForm] = useState({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "", responsible_id: "" });
  const [actionForm, setActionForm] = useState({
    non_conformity_id: "", action_type: "corrective" as "corrective" | "preventive" | "immediate",
    description: "", responsible_id: "", due_date: "", status: "open", file: null as File | null,
  });
  const [editingNc, setEditingNc] = useState<NonConformity | null>(null);
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null);
  const [editingCapa, setEditingCapa] = useState<CapaPlan | null>(null);
  const [editingAudit, setEditingAudit] = useState<Audit | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();

  const normalizeText = (value: string | null | undefined) =>
    (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const normalizedQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const auditCapaPlans = useMemo(() => capaPlans.filter((p) => p.audit_id === selectedAuditId), [capaPlans, selectedAuditId]);
  const selectedCapaPlan = useMemo(() => capaPlans.find((p) => p.id === selectedCapaPlanId) ?? null, [capaPlans, selectedCapaPlanId]);
  const filteredNcs = useMemo(() => nonConformities.filter((nc) => nc.capa_plan_id === selectedCapaPlanId), [nonConformities, selectedCapaPlanId]);

  useEffect(() => {
    if (auditCapaPlans.length > 0) {
      setSelectedCapaPlanId(auditCapaPlans[0].id);
    } else {
      setSelectedCapaPlanId(null);
    }
  }, [selectedAuditId, auditCapaPlans.length]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [{ data: auditsData }, { data: attachData }, { data: participantsData }, { data: capaData }, { data: ncData }, { data: actionData }, { data: usersData }, { data: incData }, { data: linksData }] = await Promise.all([
        (supabase as any).from("audits").select("id,title,description,audit_date,auditor_id,responsible_id,observations,findings,conclusions,status").order("created_at", { ascending: false }),
        (supabase as any).from("audit_attachments").select("id,audit_id,file_name,object_path,file_type"),
        (supabase as any).from("audit_participants").select("id,audit_id,user_id"),
        (supabase as any).from("capa_plans").select("id,audit_id,title,description,responsible_id"),
        (supabase as any).from("non_conformities").select("id,capa_plan_id,title,description,severity,root_cause,status,deadline,responsible_id"),
        (supabase as any).from("actions").select("id,non_conformity_id,action_type,description,responsible_id,due_date,status"),
        (supabase as any).from("profiles").select("id,full_name,email"),
        (supabase as any).from("incidencias").select("id,title,status"),
        (supabase as any).from("incidencia_capa_plans").select("incidencia_id,capa_plan_id"),
      ]);
      setAudits((auditsData ?? []) as Audit[]);
      setAuditAttachments((attachData ?? []) as AuditAttachment[]);
      setAuditParticipants((participantsData ?? []) as AuditParticipant[]);
      setCapaPlans((capaData ?? []) as CapaPlan[]);
      setNonConformities((ncData ?? []) as NonConformity[]);
      setActions((actionData ?? []) as ActionItem[]);
      setUsers((usersData ?? []) as Profile[]);
      setIncidencias((incData ?? []) as IncidenciaRef[]);
      setCapaIncidenciaLinks((linksData ?? []) as CapaIncidenciaLink[]);
      if (!selectedAuditId && auditsData?.[0]?.id) setSelectedAuditId(auditsData[0].id);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const selectedAudit = audits.find((a) => a.id === selectedAuditId) ?? null;
  const selectedAuditAttachments = useMemo(() => auditAttachments.filter((a) => a.audit_id === selectedAuditId), [auditAttachments, selectedAuditId]);
  const selectedAuditParticipants = useMemo(() => auditParticipants.filter((p) => p.audit_id === selectedAuditId), [auditParticipants, selectedAuditId]);

  const getUserName = (id: string | null) => {
    if (!id) return null;
    const u = users.find((u) => u.id === id);
    return u ? (u.full_name ?? u.email ?? id) : null;
  };

  const auditsFiltered = useMemo(() => {
    if (!normalizedQuery) return audits;
    return audits.filter((audit) => {
      const relatedCapa = capaPlans.filter((plan) => plan.audit_id === audit.id);
      const searchFields = [
        audit.title, audit.description, audit.audit_date, audit.observations,
        audit.findings, audit.conclusions, audit.status,
        getUserName(audit.auditor_id),
        ...relatedCapa.map((plan) => plan.title),
        ...relatedCapa.map((plan) => plan.description),
      ];
      return searchFields.some((field) => normalizeText(field).includes(normalizedQuery));
    });
  }, [audits, capaPlans, normalizedQuery, users]);

  const auditsSorted = useMemo(() => {
    return [...auditsFiltered].sort((left, right) => {
      const leftDate = left.audit_date ? new Date(left.audit_date).getTime() : 0;
      const rightDate = right.audit_date ? new Date(right.audit_date).getTime() : 0;
      return rightDate - leftDate;
    });
  }, [auditsFiltered]);

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(auditsSorted.length / PAGE_SIZE));
  const paginatedAudits = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return auditsSorted.slice(start, start + PAGE_SIZE);
  }, [auditsSorted, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [normalizedQuery]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  useEffect(() => {
    if (!selectedAuditId) {
      if (paginatedAudits[0]?.id) setSelectedAuditId(paginatedAudits[0].id);
      return;
    }
    const auditStillVisible = auditsSorted.some((audit) => audit.id === selectedAuditId);
    if (!auditStillVisible) setSelectedAuditId(paginatedAudits[0]?.id ?? null);
  }, [auditsSorted, paginatedAudits, selectedAuditId]);

  // --- CRUD ---
  const createAudit = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    const { data: profileData } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id ?? "").maybeSingle();
    const { data, error } = await (supabase as any).from("audits").insert({
      title: auditForm.title, description: auditForm.description || null,
      audit_date: auditForm.audit_date || null, auditor_id: auditForm.auditor_id || null,
      responsible_id: auditForm.responsible_id || null,
      observations: auditForm.observations || null, findings: auditForm.findings || null,
      conclusions: auditForm.conclusions || null, status: auditForm.status,
      company_id: profileData?.company_id, created_by: user?.id,
    }).select("id").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (auditFiles) await uploadAuditAttachments(data.id, auditFiles);
    await syncParticipants(data.id, auditForm.participant_ids);
    toast({ title: "Auditoría creada" });
    setNewAuditOpen(false);
    resetAuditForm();
    await loadData();
  };

  const updateAudit = async () => {
    if (!editingAudit) return;
    const { error } = await (supabase as any).from("audits").update({
      title: auditForm.title, description: auditForm.description || null,
      audit_date: auditForm.audit_date || null, auditor_id: auditForm.auditor_id || null,
      responsible_id: auditForm.responsible_id || null,
      observations: auditForm.observations || null, findings: auditForm.findings || null,
      conclusions: auditForm.conclusions || null, status: auditForm.status,
    }).eq("id", editingAudit.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (auditFiles) await uploadAuditAttachments(editingAudit.id, auditFiles);
    await syncParticipants(editingAudit.id, auditForm.participant_ids);
    toast({ title: "Auditoría actualizada" });
    setEditAuditOpen(false);
    setEditingAudit(null);
    await loadData();
  };

  const deleteAudit = async (auditId: string) => {
    // Delete attachments from storage first
    const attachments = auditAttachments.filter((a) => a.audit_id === auditId);
    if (attachments.length > 0) {
      await supabase.storage.from("documents").remove(attachments.map((a) => a.object_path));
    }
    const { error } = await (supabase as any).from("audits").delete().eq("id", auditId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Auditoría eliminada" });
    if (selectedAuditId === auditId) setSelectedAuditId(null);
    await loadData();
  };

  const uploadAuditAttachments = async (auditId: string, files: FileList) => {
    const user = (await supabase.auth.getUser()).data.user;
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const filePath = `audits/${auditId}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from("documents").upload(filePath, file, { upsert: false });
      if (!upload.error) {
        await (supabase as any).from("audit_attachments").insert({
          audit_id: auditId, bucket_id: "documents", object_path: filePath,
          file_name: file.name, file_type: file.type, created_by: user?.id,
        });
      }
    }
  };

  const deleteAuditAttachment = async (attachment: AuditAttachment) => {
    await supabase.storage.from("documents").remove([attachment.object_path]);
    await (supabase as any).from("audit_attachments").delete().eq("id", attachment.id);
    toast({ title: "Adjunto eliminado" });
    await loadData();
  };

  const downloadAttachment = async (attachment: AuditAttachment) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(attachment.object_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const syncParticipants = async (auditId: string, userIds: string[]) => {
    // Delete existing participants
    await (supabase as any).from("audit_participants").delete().eq("audit_id", auditId);
    // Insert new ones
    if (userIds.length > 0) {
      await (supabase as any).from("audit_participants").insert(
        userIds.map((uid) => ({ audit_id: auditId, user_id: uid }))
      );
    }
  };
  const resetAuditForm = () => {
    setAuditForm({ title: "", description: "", audit_date: "", auditor_id: "", responsible_id: "", observations: "", findings: "", conclusions: "", status: "open", participant_ids: [] });
    setAuditFiles(null);
  };

  const openEditAudit = (audit: Audit) => {
    setEditingAudit(audit);
    const participantUserIds = auditParticipants.filter((p) => p.audit_id === audit.id).map((p) => p.user_id);
    setAuditForm({
      title: audit.title, description: audit.description ?? "", audit_date: audit.audit_date ?? "",
      auditor_id: audit.auditor_id ?? "", responsible_id: audit.responsible_id ?? "",
      observations: audit.observations ?? "", findings: audit.findings ?? "",
      conclusions: audit.conclusions ?? "", status: audit.status ?? "open",
      participant_ids: participantUserIds,
    });
    setAuditFiles(null);
    setEditAuditOpen(true);
  };

  const createCapaPlan = async () => {
    if (!selectedAuditId) return;
    const { error } = await (supabase as any).from("capa_plans").insert({
      audit_id: selectedAuditId, title: capaForm.title || null,
      description: capaForm.description || null, responsible_id: capaForm.responsible_id || null,
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
      title: capaForm.title || null, description: capaForm.description || null,
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
    setNcForm({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "", responsible_id: "" });
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
    setNcForm({ title: nc.title, description: nc.description ?? "", severity: nc.severity ?? "", root_cause: nc.root_cause ?? "", status: nc.status, deadline: nc.deadline ?? "", responsible_id: nc.responsible_id ?? "" });
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

  const getLinkedIncidencias = (capaId: string) => {
    const linkedIds = capaIncidenciaLinks.filter((l) => l.capa_plan_id === capaId).map((l) => l.incidencia_id);
    return incidencias.filter((i) => linkedIds.includes(i.id));
  };

  const getUnlinkedIncidencias = (capaId: string) => {
    const linkedIds = capaIncidenciaLinks.filter((l) => l.capa_plan_id === capaId).map((l) => l.incidencia_id);
    return incidencias.filter((i) => !linkedIds.includes(i.id));
  };

  const linkIncidencia = async (capaId: string, incidenciaId: string) => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await (supabase as any).from("incidencia_capa_plans").insert({
      incidencia_id: incidenciaId, capa_plan_id: capaId, created_by: userId,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Incidencia vinculada" });
    await loadData();
  };

  const unlinkIncidencia = async (capaId: string, incidenciaId: string) => {
    const { error } = await (supabase as any).from("incidencia_capa_plans")
      .delete().eq("capa_plan_id", capaId).eq("incidencia_id", incidenciaId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Incidencia desvinculada" });
    await loadData();
  };

  const openEditCapa = (capa: CapaPlan) => {
    setEditingCapa(capa);
    setCapaForm({ title: capa.title ?? "", description: capa.description ?? "", responsible_id: capa.responsible_id ?? "" });
    setEditCapaOpen(true);
  };

  // --- Audit form fields ---
  const renderAuditFields = () => (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      <div><Label>Título *</Label><Input value={auditForm.title} onChange={(e) => setAuditForm((p) => ({ ...p, title: e.target.value }))} /></div>
      <div><Label>Fecha</Label><Input type="date" value={auditForm.audit_date} onChange={(e) => setAuditForm((p) => ({ ...p, audit_date: e.target.value }))} /></div>
      <div>
        <Label>Auditor</Label>
        <Select value={auditForm.auditor_id} onValueChange={(v) => setAuditForm((p) => ({ ...p, auditor_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecciona auditor" /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Responsable de la auditoría</Label>
        <Select value={auditForm.responsible_id} onValueChange={(v) => setAuditForm((p) => ({ ...p, responsible_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Empleados asignados</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {auditForm.participant_ids.map((uid) => (
            <span key={uid} className="inline-flex items-center gap-1 text-xs bg-secondary text-secondary-foreground rounded-full px-2 py-1">
              {getUserName(uid) ?? uid}
              <button type="button" onClick={() => setAuditForm((p) => ({ ...p, participant_ids: p.participant_ids.filter((id) => id !== uid) }))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <Select value="" onValueChange={(v) => { if (v && !auditForm.participant_ids.includes(v)) setAuditForm((p) => ({ ...p, participant_ids: [...p.participant_ids, v] })); }}>
          <SelectTrigger><SelectValue placeholder="Añadir empleado" /></SelectTrigger>
          <SelectContent>{users.filter((u) => !auditForm.participant_ids.includes(u.id)).map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Estado</Label>
        <Select value={auditForm.status} onValueChange={(v) => setAuditForm((p) => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abierta</SelectItem>
            <SelectItem value="in_progress">En proceso</SelectItem>
            <SelectItem value="closed">Cerrada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Descripción</Label><Textarea value={auditForm.description} onChange={(e) => setAuditForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
      <div><Label>Observaciones</Label><Textarea value={auditForm.observations} onChange={(e) => setAuditForm((p) => ({ ...p, observations: e.target.value }))} rows={3} placeholder="Observaciones generales de la auditoría" /></div>
      <div><Label>Hallazgos</Label><Textarea value={auditForm.findings} onChange={(e) => setAuditForm((p) => ({ ...p, findings: e.target.value }))} rows={3} placeholder="Hallazgos detectados durante la auditoría" /></div>
      <div><Label>Conclusiones</Label><Textarea value={auditForm.conclusions} onChange={(e) => setAuditForm((p) => ({ ...p, conclusions: e.target.value }))} rows={3} placeholder="Conclusiones finales de la auditoría" /></div>
      <div>
        <Label>Documentos adjuntos</Label>
        <Input type="file" multiple onChange={(e) => setAuditFiles(e.target.files)} />
        {auditFiles && Array.from(auditFiles).map((f, i) => (
          <p key={i} className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" />{f.name}</p>
        ))}
      </div>
    </div>
  );

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
          <SelectContent>{actionStatus.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
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
          <SelectContent>{actionStatus.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
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
  const statusLabel = (s: string) => {
    const map: Record<string, string> = { open: "Abierta", in_progress: "En proceso", closed: "Cerrada" };
    return map[s] ?? s;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Audits list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Auditorías</CardTitle>
          {canEditContent && <Button size="sm" onClick={() => { resetAuditForm(); setNewAuditOpen(true); }}><Plus className="mr-1 h-4 w-4" />Nueva</Button>}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando auditorías...</p>}

          {!isLoading && paginatedAudits.map((audit) => (
            <button key={audit.id} onClick={() => setSelectedAuditId(audit.id)} className={`w-full rounded border p-3 text-left ${selectedAuditId === audit.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <p className="font-medium">{audit.title}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{audit.audit_date ?? "Sin fecha"}</p>
                <span className="text-xs text-muted-foreground">{statusLabel(audit.status)}</span>
              </div>
            </button>
          ))}

          {!isLoading && auditsSorted.length === 0 && normalizedQuery && (
            <p className="text-sm text-muted-foreground">No se encontraron auditorías para '{searchQuery}'</p>
          )}

          {!isLoading && auditsSorted.length === 0 && !normalizedQuery && (
            <p className="text-sm text-muted-foreground">No hay auditorías registradas.</p>
          )}

          {!isLoading && auditsSorted.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>Página {currentPage} de {totalPages}</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>Anterior</Button>
                <Button type="button" size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Audit info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Información de auditoría</CardTitle>
            {selectedAudit && canEditContent && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEditAudit(selectedAudit)}>
                  <Pencil className="mr-1 h-4 w-4" />Editar
                </Button>
                {canManageCompany && (
                  <Button size="sm" variant="destructive" onClick={async () => {
                    setDeletingAuditId(selectedAudit.id);
                    // Check linked records
                    const links: string[] = [];
                    const auditCapas = capaPlans.filter(c => c.audit_id === selectedAudit.id);
                    const auditNcs = nonConformities.filter(nc => auditCapas.some(c => c.id === nc.capa_plan_id));
                    const auditActions = actions.filter(a => auditNcs.some(nc => nc.id === a.non_conformity_id));
                    const auditAtts = auditAttachments.filter(a => a.audit_id === selectedAudit.id);
                    const auditParts = auditParticipants.filter(p => p.audit_id === selectedAudit.id);
                    const linkedIncidencias = capaIncidenciaLinks.filter(l => auditCapas.some(c => c.id === l.capa_plan_id));

                    if (auditCapas.length > 0) links.push(`${auditCapas.length} plan(es) CAPA`);
                    if (auditNcs.length > 0) links.push(`${auditNcs.length} no conformidad(es)`);
                    if (auditActions.length > 0) links.push(`${auditActions.length} acción(es)`);
                    if (auditAtts.length > 0) links.push(`${auditAtts.length} adjunto(s)`);
                    if (auditParts.length > 0) links.push(`${auditParts.length} participante(s)`);
                    if (linkedIncidencias.length > 0) links.push(`${linkedIncidencias.length} incidencia(s) vinculada(s)`);

                    setAuditLinkedInfo(links);
                    setDeleteAuditConfirmOpen(true);
                  }}>
                    <Trash2 className="mr-1 h-4 w-4" />Eliminar
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {selectedAudit ? (
              <div className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><span className="font-medium text-muted-foreground">Título:</span> <span>{selectedAudit.title}</span></div>
                  <div><span className="font-medium text-muted-foreground">Fecha:</span> <span>{selectedAudit.audit_date ?? "Sin fecha"}</span></div>
                  <div><span className="font-medium text-muted-foreground">Auditor:</span> <span>{getUserName(selectedAudit.auditor_id) ?? "Sin asignar"}</span></div>
                  <div><span className="font-medium text-muted-foreground">Responsable:</span> <span>{getUserName(selectedAudit.responsible_id) ?? "Sin asignar"}</span></div>
                  <div><span className="font-medium text-muted-foreground">Estado:</span> <span>{statusLabel(selectedAudit.status)}</span></div>
                </div>
                {selectedAuditParticipants.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Empleados asignados:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedAuditParticipants.map((p) => (
                        <span key={p.id} className="text-xs bg-secondary text-secondary-foreground rounded-full px-2 py-1">
                          {getUserName(p.user_id) ?? p.user_id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedAudit.description && (
                  <div><p className="font-medium text-muted-foreground mb-1">Descripción:</p><p className="whitespace-pre-wrap">{selectedAudit.description}</p></div>
                )}
                {selectedAudit.observations && (
                  <div><p className="font-medium text-muted-foreground mb-1">Observaciones:</p><p className="whitespace-pre-wrap">{selectedAudit.observations}</p></div>
                )}
                {selectedAudit.findings && (
                  <div><p className="font-medium text-muted-foreground mb-1">Hallazgos:</p><p className="whitespace-pre-wrap">{selectedAudit.findings}</p></div>
                )}
                {selectedAudit.conclusions && (
                  <div><p className="font-medium text-muted-foreground mb-1">Conclusiones:</p><p className="whitespace-pre-wrap">{selectedAudit.conclusions}</p></div>
                )}
                {/* Attachments */}
                {selectedAuditAttachments.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Documentos adjuntos:</p>
                    <div className="space-y-1">
                      {selectedAuditAttachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between rounded border p-2">
                          <button onClick={() => downloadAttachment(att)} className="flex items-center gap-2 text-sm hover:underline text-primary">
                            <FileText className="h-4 w-4" />{att.file_name ?? att.object_path}
                          </button>
                          {canEditContent && (
                            <button onClick={() => deleteAuditAttachment(att)} className="text-destructive hover:text-destructive/80">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
              const linkedIncs = getLinkedIncidencias(capa.id);
              return (
                <div key={capa.id} onClick={() => setSelectedCapaPlanId(capa.id)} className={`rounded border p-3 cursor-pointer ${selectedCapaPlanId === capa.id ? "border-primary bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{capa.title || "Plan CAPA"}</p>
                    <div className="flex items-center gap-1">
                      {canEditContent && (
                        <button onClick={(e) => { e.stopPropagation(); setLinkingCapaPlanId(capa.id); setLinkIncidenciaOpen(true); }} className="text-muted-foreground hover:text-foreground" title="Vincular incidencias">
                          <AlertCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canEditContent && (
                        <button onClick={(e) => { e.stopPropagation(); openEditCapa(capa); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {capa.responsible_id && <p className="text-xs text-muted-foreground">Responsable: {getUserName(capa.responsible_id)}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{ncCount} NC · {actCount} acciones · {linkedIncs.length} incidencias</p>
                  {linkedIncs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {linkedIncs.map((inc) => (
                        <span key={inc.id} className="inline-flex items-center gap-1 text-xs bg-destructive/10 text-destructive rounded-full px-1.5 py-0.5">
                          {inc.title}
                          {canEditContent && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); unlinkIncidencia(capa.id, inc.id); }} className="hover:text-foreground">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
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
                <Button size="sm" variant="outline" onClick={() => { setNcForm({ title: "", description: "", severity: "", root_cause: "", status: "open", deadline: "", responsible_id: "" }); setNewNcOpen(true); }}>Añadir NC</Button>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nueva auditoría</DialogTitle></DialogHeader>
          {renderAuditFields()}
          <DialogFooter><Button onClick={createAudit} disabled={!auditForm.title}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Audit Dialog */}
      <Dialog open={editAuditOpen} onOpenChange={(o) => { setEditAuditOpen(o); if (!o) setEditingAudit(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar auditoría</DialogTitle></DialogHeader>
          {renderAuditFields()}
          {/* Existing attachments */}
          {editingAudit && (
            <div>
              <Label className="text-muted-foreground">Adjuntos existentes</Label>
              {auditAttachments.filter((a) => a.audit_id === editingAudit.id).length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Sin adjuntos.</p>
              )}
              {auditAttachments.filter((a) => a.audit_id === editingAudit.id).map((att) => (
                <div key={att.id} className="flex items-center justify-between rounded border p-2 mt-1">
                  <span className="text-sm flex items-center gap-1"><FileText className="h-3 w-3" />{att.file_name ?? att.object_path}</span>
                  <button onClick={() => deleteAuditAttachment(att)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            {canEditContent ? <Button onClick={updateAudit} disabled={!auditForm.title}>Guardar cambios</Button> : <p className="text-sm text-muted-foreground">Solo lectura</p>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Audit Confirm */}
      <AlertDialog open={deleteAuditConfirmOpen} onOpenChange={setDeleteAuditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar auditoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la auditoría y todos sus datos asociados. No se puede deshacer.
            </AlertDialogDescription>
            {auditLinkedInfo.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 mt-2 space-y-1.5">
                <p className="text-sm font-medium text-destructive">⚠️ Esta auditoría está vinculada a:</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
                  {auditLinkedInfo.map((info, i) => (
                    <li key={i}>{info}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-1">Todos estos registros serán eliminados junto con la auditoría.</p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deletingAuditId) deleteAudit(deletingAuditId); setDeleteAuditConfirmOpen(false); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Link Incidencia Dialog */}
      <Dialog open={linkIncidenciaOpen} onOpenChange={(o) => { setLinkIncidenciaOpen(o); if (!o) setLinkingCapaPlanId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular incidencias</DialogTitle>
            <DialogDescription>Selecciona incidencias para asociar a este plan CAPA.</DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {linkingCapaPlanId && getUnlinkedIncidencias(linkingCapaPlanId).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay incidencias disponibles para vincular.</p>
            )}
            {linkingCapaPlanId && getUnlinkedIncidencias(linkingCapaPlanId).map((inc) => (
              <div key={inc.id} className="flex items-center justify-between rounded border p-2 hover:bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">{inc.status}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { if (linkingCapaPlanId) linkIncidencia(linkingCapaPlanId, inc.id); }}>Vincular</Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkIncidenciaOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
