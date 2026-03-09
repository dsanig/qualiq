import { useEffect, useMemo, useState } from "react";
import { Plus, Paperclip, Pencil, Trash2, FileText, ChevronsUpDown, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuditLog } from "@/hooks/useAuditLog";

type Audit = {
  id: string; title: string; description: string | null; audit_date: string | null;
  auditor_id: string | null; responsible_id: string | null; observations: string | null;
  findings: string | null; conclusions: string | null; status: string;
  audit_type: string; external_entity_id: string | null;
};
type AuditAttachment = { id: string; audit_id: string; file_name: string | null; object_path: string; file_type: string | null };
type AuditParticipant = { id: string; audit_id: string; user_id: string };
type Profile = { id: string; full_name: string | null; email: string | null };

interface AuditManagementViewProps {
  searchQuery?: string;
}

export function AuditManagementView({ searchQuery = "" }: AuditManagementViewProps) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [auditAttachments, setAuditAttachments] = useState<AuditAttachment[]>([]);
  const [auditParticipants, setAuditParticipants] = useState<AuditParticipant[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const { canEditContent, canManageCompany } = usePermissions();
  const { logAction } = useAuditLog();

  // Dialog states
  const [newAuditOpen, setNewAuditOpen] = useState(false);
  const [editAuditOpen, setEditAuditOpen] = useState(false);
  const [deleteAuditConfirmOpen, setDeleteAuditConfirmOpen] = useState(false);
  const [deletingAuditId, setDeletingAuditId] = useState<string | null>(null);
  const [auditLinkedInfo, setAuditLinkedInfo] = useState<string[]>([]);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Forms
  const [auditForm, setAuditForm] = useState({
    title: "", description: "", audit_date: "", auditor_id: "", responsible_id: "",
    observations: "", findings: "", conclusions: "", status: "open",
    participant_ids: [] as string[],
    audit_type: "interna" as "interna" | "externa", external_entity_id: "",
  });
  const [auditFiles, setAuditFiles] = useState<FileList | null>(null);
  const [editingAudit, setEditingAudit] = useState<Audit | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null)).catch(() => setCurrentUserId(null));
  }, []);

  const normalizeText = (value: string | null | undefined) =>
    (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const normalizedQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [{ data: auditsData }, { data: attachData }, { data: participantsData }, { data: usersData }] = await Promise.all([
        (supabase as any).from("audits").select("id,title,description,audit_date,auditor_id,responsible_id,observations,findings,conclusions,status,audit_type,external_entity_id").order("created_at", { ascending: false }),
        (supabase as any).from("audit_attachments").select("id,audit_id,file_name,object_path,file_type"),
        (supabase as any).from("audit_participants").select("id,audit_id,user_id"),
        (supabase as any).from("profiles").select("id,full_name,email"),
      ]);
      setAudits((auditsData ?? []) as Audit[]);
      setAuditAttachments((attachData ?? []) as AuditAttachment[]);
      setAuditParticipants((participantsData ?? []) as AuditParticipant[]);
      setUsers((usersData ?? []) as Profile[]);
      if (!selectedAuditId && auditsData?.[0]?.id) setSelectedAuditId(auditsData[0].id);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const selectedAudit = audits.find((a) => a.id === selectedAuditId) ?? null;
  const selectedAuditAttachments = useMemo(
    () => auditAttachments.filter((a) => a.audit_id === selectedAuditId),
    [auditAttachments, selectedAuditId],
  );
  const selectedAuditParticipants = useMemo(
    () => auditParticipants.filter((p) => p.audit_id === selectedAuditId),
    [auditParticipants, selectedAuditId],
  );

  const canEditSelectedAudit = useMemo(() => {
    if (!selectedAudit || !currentUserId) return false;
    return selectedAudit.auditor_id === currentUserId || selectedAudit.responsible_id === currentUserId;
  }, [selectedAudit, currentUserId]);

  const canEditEditingAudit = useMemo(() => {
    if (!editingAudit || !currentUserId) return false;
    return editingAudit.auditor_id === currentUserId || editingAudit.responsible_id === currentUserId;
  }, [editingAudit, currentUserId]);

  const getUserName = (id: string | null) => {
    if (!id) return null;
    const u = users.find((u) => u.id === id);
    return u ? (u.full_name ?? u.email ?? id) : null;
  };

  const auditsFiltered = useMemo(() => {
    if (!normalizedQuery) return audits;
    return audits.filter((audit) => {
      const searchFields = [
        audit.title, audit.description, audit.audit_date, audit.observations,
        audit.findings, audit.conclusions, audit.status,
        getUserName(audit.auditor_id),
      ];
      return searchFields.some((field) => normalizeText(field).includes(normalizedQuery));
    });
  }, [audits, normalizedQuery, users]);

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
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      toast({ title: "Error", description: "Debes iniciar sesión para crear una auditoría.", variant: "destructive" });
      return;
    }

    if (!auditForm.auditor_id || !auditForm.responsible_id) {
      toast({ title: "Error", description: "Auditor y responsable son obligatorios.", variant: "destructive" });
      return;
    }

    if (auditForm.audit_type === "externa" && !auditForm.external_entity_id.trim()) {
      toast({ title: "Error", description: "La identificación del cliente/proveedor es obligatoria.", variant: "destructive" });
      return;
    }

    const callerIsAssignee = user.id === auditForm.auditor_id || user.id === auditForm.responsible_id;

    if ((auditFiles?.length ?? 0) > 0 && !callerIsAssignee) {
      toast({ title: "Sin permisos", description: "Solo el auditor o el responsable pueden adjuntar documentos.", variant: "destructive" });
      return;
    }

    if (auditForm.participant_ids.length > 0 && !callerIsAssignee) {
      toast({ title: "Sin permisos", description: "Solo el auditor o el responsable pueden gestionar los participantes.", variant: "destructive" });
      return;
    }

    const { data: profileData } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();

    const { data, error } = await (supabase as any)
      .from("audits")
      .insert({
        title: auditForm.title,
        description: auditForm.description || null,
        audit_date: auditForm.audit_date || null,
        auditor_id: auditForm.auditor_id,
        responsible_id: auditForm.responsible_id,
        observations: auditForm.observations || null,
        findings: auditForm.findings || null,
        conclusions: auditForm.conclusions || null,
        status: auditForm.status,
        audit_type: auditForm.audit_type,
        external_entity_id: auditForm.audit_type === "externa" ? auditForm.external_entity_id.trim() : null,
        company_id: profileData?.company_id,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    if (auditFiles) await uploadAuditAttachments(data.id, auditFiles);
    await syncParticipants(data.id, auditForm.participant_ids);

    toast({ title: "Auditoría creada" });
    logAction({ action: "create", entity_type: "audit", entity_id: data?.id, entity_title: auditForm.title, details: { status: auditForm.status } });
    setNewAuditOpen(false);
    resetAuditForm();
    await loadData();
  };

  const updateAudit = async () => {
    if (!editingAudit) return;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      toast({ title: "Error", description: "Debes iniciar sesión para actualizar una auditoría.", variant: "destructive" });
      return;
    }

    if (!auditForm.auditor_id || !auditForm.responsible_id) {
      toast({ title: "Error", description: "Auditor y responsable son obligatorios.", variant: "destructive" });
      return;
    }

    if (auditForm.audit_type === "externa" && !auditForm.external_entity_id.trim()) {
      toast({ title: "Error", description: "La identificación del cliente/proveedor es obligatoria.", variant: "destructive" });
      return;
    }

    const callerIsAssigneeAfter = user.id === auditForm.auditor_id || user.id === auditForm.responsible_id;

    const existingParticipantIds = auditParticipants.filter((p) => p.audit_id === editingAudit.id).map((p) => p.user_id).sort();
    const nextParticipantIds = [...auditForm.participant_ids].sort();
    const participantsChanged = existingParticipantIds.join(",") !== nextParticipantIds.join(",");

    if ((auditFiles?.length ?? 0) > 0 && !callerIsAssigneeAfter) {
      toast({ title: "Sin permisos", description: "Solo el auditor o el responsable pueden adjuntar documentos.", variant: "destructive" });
      return;
    }

    if (participantsChanged && !callerIsAssigneeAfter) {
      toast({ title: "Sin permisos", description: "Solo el auditor o el responsable pueden gestionar los participantes.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any)
      .from("audits")
      .update({
        title: auditForm.title,
        description: auditForm.description || null,
        audit_date: auditForm.audit_date || null,
        auditor_id: auditForm.auditor_id,
        responsible_id: auditForm.responsible_id,
        observations: auditForm.observations || null,
        findings: auditForm.findings || null,
        conclusions: auditForm.conclusions || null,
        status: auditForm.status,
        audit_type: auditForm.audit_type,
        external_entity_id: auditForm.audit_type === "externa" ? auditForm.external_entity_id.trim() : null,
      })
      .eq("id", editingAudit.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    if (auditFiles) await uploadAuditAttachments(editingAudit.id, auditFiles);
    if (participantsChanged) await syncParticipants(editingAudit.id, auditForm.participant_ids);

    toast({ title: "Auditoría actualizada" });
    logAction({ action: "update", entity_type: "audit", entity_id: editingAudit.id, entity_title: auditForm.title, details: { status: auditForm.status } });
    setEditAuditOpen(false);
    setEditingAudit(null);
    await loadData();
  };

  const deleteAudit = async (auditId: string) => {
    const attachments = auditAttachments.filter((a) => a.audit_id === auditId);
    for (const att of attachments) {
      await supabase.storage.from(att.object_path.split("/")[0] || "documents").remove([att.object_path]);
    }

    await (supabase as any).from("audit_attachments").delete().eq("audit_id", auditId);
    await (supabase as any).from("audit_participants").delete().eq("audit_id", auditId);
    
    // Unlink incidencias
    await (supabase as any).from("incidencias").update({ audit_id: null }).eq("audit_id", auditId);

    const { error } = await (supabase as any).from("audits").delete().eq("id", auditId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Auditoría eliminada" });
    logAction({ action: "delete", entity_type: "audit", entity_id: auditId });
    setDeletingAuditId(null);
    setSelectedAuditId(null);
    await loadData();
  };

  const uploadAuditAttachments = async (auditId: string, files: FileList) => {
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `audits/${auditId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
      if (uploadError) continue;
      await (supabase as any).from("audit_attachments").insert({
        audit_id: auditId,
        object_path: path,
        file_name: file.name,
        file_type: file.type,
        created_by: currentUserId,
      });
    }
    setAuditFiles(null);
  };

  const deleteAuditAttachment = async (att: AuditAttachment) => {
    await supabase.storage.from("documents").remove([att.object_path]);
    await (supabase as any).from("audit_attachments").delete().eq("id", att.id);
    toast({ title: "Adjunto eliminado" });
    await loadData();
  };

  const downloadAttachment = async (att: AuditAttachment) => {
    const { data, error } = await supabase.storage.from("documents").download(att.object_path);
    if (error || !data) {
      toast({ title: "Error", description: "No se pudo descargar el archivo.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.file_name ?? att.object_path.split("/").pop() ?? "file";
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncParticipants = async (auditId: string, userIds: string[]) => {
    await (supabase as any).from("audit_participants").delete().eq("audit_id", auditId);
    if (userIds.length === 0) return;
    await (supabase as any).from("audit_participants").insert(userIds.map((uid) => ({ audit_id: auditId, user_id: uid })));
  };

  const resetAuditForm = () => {
    setAuditForm({
      title: "", description: "", audit_date: "", auditor_id: "", responsible_id: "",
      observations: "", findings: "", conclusions: "", status: "open",
      participant_ids: [],
      audit_type: "interna", external_entity_id: "",
    });
    setAuditFiles(null);
  };

  const openEditAudit = (audit: Audit) => {
    const participantIds = auditParticipants.filter((p) => p.audit_id === audit.id).map((p) => p.user_id);
    setAuditForm({
      title: audit.title,
      description: audit.description ?? "",
      audit_date: audit.audit_date ?? "",
      auditor_id: audit.auditor_id ?? "",
      responsible_id: audit.responsible_id ?? "",
      observations: audit.observations ?? "",
      findings: audit.findings ?? "",
      conclusions: audit.conclusions ?? "",
      status: audit.status,
      participant_ids: participantIds,
      audit_type: (audit.audit_type as "interna" | "externa") ?? "interna",
      external_entity_id: audit.external_entity_id ?? "",
    });
    setEditingAudit(audit);
    setEditAuditOpen(true);
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { open: "Abierta", in_progress: "En proceso", closed: "Cerrada" };
    return map[s] ?? s;
  };

  // --- Audit form fields ---
  const renderAuditFields = ({ readOnly }: { readOnly: boolean }) => (
    <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-2">
      <div>
        <Label>Título *</Label>
        <Input disabled={readOnly} value={auditForm.title} onChange={(e) => setAuditForm((p) => ({ ...p, title: e.target.value }))} />
      </div>
      <div>
        <Label>Tipo de auditoría *</Label>
        <Select disabled={readOnly} value={auditForm.audit_type} onValueChange={(v: "interna" | "externa") => setAuditForm((p) => ({ ...p, audit_type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="interna">Interna</SelectItem>
            <SelectItem value="externa">Externa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {auditForm.audit_type === "externa" && (
        <div>
          <Label>Cliente/Proveedor *</Label>
          <Input disabled={readOnly} value={auditForm.external_entity_id} onChange={(e) => setAuditForm((p) => ({ ...p, external_entity_id: e.target.value }))} placeholder="Nombre o identificador" />
        </div>
      )}
      <div>
        <Label>Fecha de auditoría</Label>
        <Input disabled={readOnly} type="date" value={auditForm.audit_date} onChange={(e) => setAuditForm((p) => ({ ...p, audit_date: e.target.value }))} />
      </div>
      <div>
        <Label>Auditor *</Label>
        <Select disabled={readOnly} value={auditForm.auditor_id} onValueChange={(v) => setAuditForm((p) => ({ ...p, auditor_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecciona auditor" /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Responsable *</Label>
        <Select disabled={readOnly} value={auditForm.responsible_id} onValueChange={(v) => setAuditForm((p) => ({ ...p, responsible_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Empleados asignados</Label>
        <div className="flex flex-wrap gap-1 mt-1 mb-1">
          {auditForm.participant_ids.map((uid) => {
            const u = users.find((u) => u.id === uid);
            return (
              <Badge key={uid} variant="secondary" className="gap-1">
                {u?.full_name ?? u?.email ?? uid}
                {!readOnly && (
                  <button type="button" onClick={() => setAuditForm((p) => ({ ...p, participant_ids: p.participant_ids.filter((id) => id !== uid) }))} className="ml-0.5 rounded-full hover:bg-muted">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
        {!readOnly && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between text-sm font-normal">
                Añadir empleados...
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar empleado..." />
                <CommandList>
                  <CommandEmpty>Sin resultados.</CommandEmpty>
                  <CommandGroup>
                    {users.map((u) => {
                      const isSelected = auditForm.participant_ids.includes(u.id);
                      return (
                        <CommandItem
                          key={u.id}
                          value={u.full_name ?? u.email ?? u.id}
                          onSelect={() => {
                            if (isSelected) {
                              setAuditForm((p) => ({ ...p, participant_ids: p.participant_ids.filter((id) => id !== u.id) }));
                            } else {
                              setAuditForm((p) => ({ ...p, participant_ids: [...p.participant_ids, u.id] }));
                            }
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                          {u.full_name ?? u.email ?? u.id}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div>
        <Label>Estado</Label>
        <Select disabled={readOnly} value={auditForm.status} onValueChange={(v) => setAuditForm((p) => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abierta</SelectItem>
            <SelectItem value="in_progress">En proceso</SelectItem>
            <SelectItem value="closed">Cerrada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Descripción</Label>
        <Textarea disabled={readOnly} value={auditForm.description} onChange={(e) => setAuditForm((p) => ({ ...p, description: e.target.value }))} rows={3} />
      </div>
      <div>
        <Label>Observaciones</Label>
        <Textarea disabled={readOnly} value={auditForm.observations} onChange={(e) => setAuditForm((p) => ({ ...p, observations: e.target.value }))} rows={3} placeholder="Observaciones generales de la auditoría" />
      </div>
      <div>
        <Label>Hallazgos</Label>
        <Textarea disabled={readOnly} value={auditForm.findings} onChange={(e) => setAuditForm((p) => ({ ...p, findings: e.target.value }))} rows={3} placeholder="Hallazgos detectados durante la auditoría" />
      </div>
      <div>
        <Label>Conclusiones</Label>
        <Textarea disabled={readOnly} value={auditForm.conclusions} onChange={(e) => setAuditForm((p) => ({ ...p, conclusions: e.target.value }))} rows={3} placeholder="Conclusiones finales de la auditoría" />
      </div>
      <div>
        <Label>Documentos adjuntos</Label>
        <Input disabled={readOnly} type="file" multiple onChange={(e) => setAuditFiles(e.target.files)} />
        {auditFiles && Array.from(auditFiles).map((f, i) => (
          <p key={i} className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" />{f.name}</p>
        ))}
      </div>
    </div>
  );

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
              <div className="flex items-center gap-2">
                <p className="font-medium flex-1">{audit.title}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${audit.audit_type === "externa" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                  {audit.audit_type === "externa" ? "Externa" : "Interna"}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
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
            {selectedAudit && (
              <div className="flex gap-2">
                {canEditSelectedAudit && (
                  <Button size="sm" variant="outline" onClick={() => openEditAudit(selectedAudit)}>
                    <Pencil className="mr-1 h-4 w-4" />Editar
                  </Button>
                )}
                {canManageCompany && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      setDeletingAuditId(selectedAudit.id);
                      const links: string[] = [];
                      const auditAtts = auditAttachments.filter(a => a.audit_id === selectedAudit.id);
                      const auditParts = auditParticipants.filter(p => p.audit_id === selectedAudit.id);
                      const { data: directIncidencias } = await supabase.from("incidencias").select("id").eq("audit_id", selectedAudit.id);
                      const directIncCount = directIncidencias?.length ?? 0;

                      if (auditAtts.length > 0) links.push(`${auditAtts.length} adjunto(s)`);
                      if (auditParts.length > 0) links.push(`${auditParts.length} participante(s)`);
                      if (directIncCount > 0) links.push(`${directIncCount} incidencia(s) directa(s) (se desvinculará(n))`);

                      setAuditLinkedInfo(links);
                      setDeleteAuditConfirmOpen(true);
                    }}
                  >
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
                  <div><span className="font-medium text-muted-foreground">Tipo:</span> <span className="capitalize">{selectedAudit.audit_type === "externa" ? "Externa" : "Interna"}</span></div>
                  {selectedAudit.audit_type === "externa" && selectedAudit.external_entity_id && (
                    <div><span className="font-medium text-muted-foreground">Cliente/Proveedor:</span> <span>{selectedAudit.external_entity_id}</span></div>
                  )}
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
                          {canEditSelectedAudit && (
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
      </div>

      {/* New Audit Dialog */}
      <Dialog open={newAuditOpen} onOpenChange={setNewAuditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nueva auditoría</DialogTitle></DialogHeader>
          {renderAuditFields({ readOnly: false })}
          <DialogFooter>
            <Button
              onClick={createAudit}
              disabled={
                !auditForm.title.trim() ||
                !auditForm.auditor_id ||
                !auditForm.responsible_id ||
                (auditForm.audit_type === "externa" && !auditForm.external_entity_id.trim())
              }
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Audit Dialog */}
      <Dialog open={editAuditOpen} onOpenChange={(o) => { setEditAuditOpen(o); if (!o) setEditingAudit(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar auditoría</DialogTitle></DialogHeader>
          {renderAuditFields({ readOnly: !canEditEditingAudit })}
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
                  {canEditEditingAudit && (
                    <button onClick={() => deleteAuditAttachment(att)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            {canEditEditingAudit ? (
              <Button
                onClick={updateAudit}
                disabled={
                  !auditForm.title.trim() ||
                  !auditForm.auditor_id ||
                  !auditForm.responsible_id ||
                  (auditForm.audit_type === "externa" && !auditForm.external_entity_id.trim())
                }
              >
                Guardar cambios
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Solo lectura</p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Audit Confirm */}
      <AlertDialog open={deleteAuditConfirmOpen} onOpenChange={(open) => { setDeleteAuditConfirmOpen(open); if (!open) setDeleteConfirmText(""); }}>
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
                <p className="text-xs text-muted-foreground mt-1">Todos estos registros serán eliminados o desvinculados.</p>
              </div>
            )}
            <div className="mt-4 space-y-2">
              <Label htmlFor="delete-confirm" className="text-sm">
                Escribe <span className="font-bold text-destructive">ELIMINAR</span> para confirmar:
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="ELIMINAR"
                className="font-mono"
              />
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText !== "ELIMINAR"}
              onClick={() => { if (deletingAuditId) deleteAudit(deletingAuditId); setDeleteAuditConfirmOpen(false); setDeleteConfirmText(""); }}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
