import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Filter, Plus, Search, Pencil, X, CalendarIcon, Trash2, AlertTriangle, Link as LinkIcon, Eye, FileWarning, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { matchesNormalizedQuery } from "@/utils/search";
import { ReclamacionFormFields, type ReclamacionFormData } from "./ReclamacionFormFields";
import { format } from "date-fns";

interface Reclamacion {
  id: string;
  title: string;
  description: string | null;
  source: string;
  source_code: string | null;
  opened_at: string;
  response_deadline: string | null;
  detail: string | null;
  investigation: string | null;
  resolution: string | null;
  conclusion: string | null;
  status: string;
  responsible_id: string | null;
  created_by: string | null;
  created_at: string;
}

interface UserRef { id: string; full_name: string | null; email: string | null; }
interface IncidenciaRef { id: string; title: string; }

interface AttachmentInfo {
  id?: string;
  file_name: string;
  isNew?: boolean;
  file?: File;
}

const statusConfig: Record<string, { label: string; icon: typeof AlertCircle; color: string }> = {
  abierta: { label: "Abierta", icon: AlertCircle, color: "text-destructive" },
  en_revision: { label: "En Revisión", icon: Eye, color: "text-warning" },
  en_resolucion: { label: "En Resolución", icon: Clock, color: "text-primary" },
  cerrada: { label: "Cerrada", icon: CheckCircle, color: "text-success" },
};

const sourceLabels: Record<string, string> = {
  proveedor: "Proveedor",
  cliente: "Cliente",
  otro: "Otro",
};

const defaultForm = (): ReclamacionFormData => ({
  title: "",
  description: "",
  source: "cliente",
  source_code: "",
  response_deadline: null,
  detail: "",
  investigation: "",
  resolution: "",
  conclusion: "",
  status: "abierta",
  responsible_id: "none",
});

interface ReclamacionesViewProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenNewIncident?: (reclamacionId: string, reclamacionTitle: string) => void;
  onNavigateToIncident?: (incidenciaId: string) => void;
}

export function ReclamacionesView({ searchQuery, onSearchChange, onOpenNewIncident }: ReclamacionesViewProps) {
  const [reclamaciones, setReclamaciones] = useState<Reclamacion[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [incidencias, setIncidencias] = useState<IncidenciaRef[]>([]);
  const [reclamacionLinks, setReclamacionLinks] = useState<Record<string, string[]>>({});
  const [selectedIncidenciaIds, setSelectedIncidenciaIds] = useState<string[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [form, setForm] = useState<ReclamacionFormData>(defaultForm());
  const [editingReclamacion, setEditingReclamacion] = useState<Reclamacion | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newAttachments, setNewAttachments] = useState<AttachmentInfo[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<AttachmentInfo[]>([]);
  const { toast } = useToast();
  const { canEditContent, isSuperadmin } = usePermissions();

  const getUserName = (userId: string | null | undefined) => {
    if (!userId) return null;
    const u = users.find((usr) => usr.id === userId);
    return u?.full_name ?? u?.email ?? userId;
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [{ data: recData }, { data: usersData }, { data: incData }, { data: linksData }] = await Promise.all([
        (supabase as any).from("reclamaciones").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id,full_name,email"),
        (supabase as any).from("incidencias").select("id,title").order("created_at", { ascending: false }),
        (supabase as any).from("reclamacion_incidencias").select("reclamacion_id,incidencia_id"),
      ]);

      setReclamaciones(Array.isArray(recData) ? recData : []);
      setUsers(Array.isArray(usersData) ? usersData.map(u => ({ id: u.user_id, full_name: u.full_name, email: u.email })).filter((u): u is UserRef => !!u.id) : []);
      setIncidencias(Array.isArray(incData) ? incData : []);

      const linksMap: Record<string, string[]> = {};
      if (Array.isArray(linksData)) {
        for (const link of linksData as any[]) {
          if (!linksMap[link.reclamacion_id]) linksMap[link.reclamacion_id] = [];
          linksMap[link.reclamacion_id].push(link.incidencia_id);
        }
      }
      setReclamacionLinks(linksMap);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const filtered = useMemo(() => {
    return reclamaciones.filter((r) => {
      const responsibleName = getUserName(r.responsible_id);
      return matchesNormalizedQuery(debouncedSearch, r.title, r.description, r.source, sourceLabels[r.source], r.status, responsibleName, r.source_code);
    });
  }, [reclamaciones, debouncedSearch, users]);

  const uploadAttachments = async (reclamacionId: string) => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    for (const att of newAttachments) {
      if (!att.file) continue;
      const path = `reclamaciones/${reclamacionId}/${Date.now()}_${att.file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, att.file);
      if (uploadError) {
        toast({ title: "Error subiendo archivo", description: att.file.name, variant: "destructive" });
        continue;
      }
      await (supabase as any).from("reclamacion_attachments").insert({
        reclamacion_id: reclamacionId,
        object_path: path,
        file_name: att.file.name,
        file_type: att.file.type || "application/octet-stream",
        created_by: userId,
      });
    }
  };

  const syncLinks = async (reclamacionId: string) => {
    const existing = reclamacionLinks[reclamacionId] ?? [];
    const toAdd = selectedIncidenciaIds.filter(id => !existing.includes(id));
    const toRemove = existing.filter(id => !selectedIncidenciaIds.includes(id));
    const userId = (await supabase.auth.getUser()).data.user?.id;

    if (toRemove.length > 0) {
      await (supabase as any).from("reclamacion_incidencias").delete().eq("reclamacion_id", reclamacionId).in("incidencia_id", toRemove);
    }
    if (toAdd.length > 0) {
      await (supabase as any).from("reclamacion_incidencias").insert(
        toAdd.map(incId => ({ reclamacion_id: reclamacionId, incidencia_id: incId, created_by: userId }))
      );
    }
  };

  const syncParticipants = async (reclamacionId: string) => {
    await (supabase as any).from("reclamacion_participants").delete().eq("reclamacion_id", reclamacionId);
    if (participantIds.length > 0) {
      await (supabase as any).from("reclamacion_participants").insert(
        participantIds.map(uid => ({ reclamacion_id: reclamacionId, user_id: uid }))
      );
    }
  };

  const createReclamacion = async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data: profileData } = await supabase.from("profiles").select("company_id").eq("user_id", userId ?? "").maybeSingle();
    const { data: inserted, error } = await (supabase as any).from("reclamaciones").insert({
      title: form.title,
      description: form.description || null,
      source: form.source,
      source_code: form.source_code || null,
      response_deadline: form.response_deadline ? format(form.response_deadline, "yyyy-MM-dd") : null,
      detail: form.detail || null,
      investigation: form.investigation || null,
      resolution: form.resolution || null,
      conclusion: form.conclusion || null,
      status: form.status,
      responsible_id: form.responsible_id === "none" ? null : form.responsible_id,
      company_id: profileData?.company_id,
      created_by: userId,
    }).select("id").single();

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (inserted && newAttachments.length > 0) await uploadAttachments(inserted.id);
    if (inserted && selectedIncidenciaIds.length > 0) await syncLinks(inserted.id);
    if (inserted) await syncParticipants(inserted.id);

    toast({ title: "Reclamación creada" });
    setIsNewOpen(false);
    setForm(defaultForm());
    setNewAttachments([]);
    setSelectedIncidenciaIds([]);
    setParticipantIds([]);
    await loadData();
  };

  const loadExistingAttachments = async (reclamacionId: string) => {
    const { data } = await (supabase as any).from("reclamacion_attachments").select("id,file_name").eq("reclamacion_id", reclamacionId);
    setExistingAttachments(Array.isArray(data) ? data.map((a: any) => ({ id: a.id, file_name: a.file_name ?? "archivo" })) : []);
  };

  const loadParticipants = async (reclamacionId: string) => {
    const { data } = await (supabase as any).from("reclamacion_participants").select("user_id").eq("reclamacion_id", reclamacionId);
    setParticipantIds(Array.isArray(data) ? data.map((p: any) => p.user_id) : []);
  };

  const openEdit = (rec: Reclamacion) => {
    setEditingReclamacion(rec);
    setForm({
      title: rec.title,
      description: rec.description ?? "",
      source: rec.source,
      source_code: rec.source_code ?? "",
      response_deadline: rec.response_deadline ? new Date(rec.response_deadline) : null,
      detail: rec.detail ?? "",
      investigation: rec.investigation ?? "",
      resolution: rec.resolution ?? "",
      conclusion: rec.conclusion ?? "",
      status: rec.status,
      responsible_id: rec.responsible_id ?? "none",
    });
    setNewAttachments([]);
    setSelectedIncidenciaIds(reclamacionLinks[rec.id] ?? []);
    void loadExistingAttachments(rec.id);
    void loadParticipants(rec.id);
    setIsEditOpen(true);
  };

  const updateReclamacion = async () => {
    if (!editingReclamacion) return;
    const { error } = await (supabase as any).from("reclamaciones").update({
      title: form.title,
      description: form.description || null,
      source: form.source,
      source_code: form.source_code || null,
      response_deadline: form.response_deadline ? format(form.response_deadline, "yyyy-MM-dd") : null,
      detail: form.detail || null,
      investigation: form.investigation || null,
      resolution: form.resolution || null,
      conclusion: form.conclusion || null,
      status: form.status,
      responsible_id: form.responsible_id === "none" ? null : form.responsible_id,
    }).eq("id", editingReclamacion.id);

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (newAttachments.length > 0) await uploadAttachments(editingReclamacion.id);
    await syncLinks(editingReclamacion.id);
    await syncParticipants(editingReclamacion.id);

    toast({ title: "Reclamación actualizada" });
    setIsEditOpen(false);
    setEditingReclamacion(null);
    setForm(defaultForm());
    setNewAttachments([]);
    setExistingAttachments([]);
    setSelectedIncidenciaIds([]);
    setParticipantIds([]);
    await loadData();
  };

  const handleAddFiles = (files: FileList) => {
    const items: AttachmentInfo[] = Array.from(files).map((f) => ({ file_name: f.name, isNew: true, file: f }));
    setNewAttachments((prev) => [...prev, ...items]);
  };

  const handleRemoveNewAttachment = (index: number) => {
    setNewAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const allAttachments = [...existingAttachments, ...newAttachments];

  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline).getTime() < Date.now();
  };

  const isDeadlineClose = (deadline: string | null) => {
    if (!deadline) return false;
    const d = new Date(deadline);
    const diff = d.getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  };

  const overdueCount = reclamaciones.filter((r) => r.status !== "cerrada" && isOverdue(r.response_deadline)).length;

  const handleOpenNewIncident = (rec: Reclamacion) => {
    if (onOpenNewIncident) {
      onOpenNewIncident(rec.id, rec.title);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-semibold">{reclamaciones.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Abiertas</p><p className="text-2xl font-semibold">{reclamaciones.filter(r => r.status === "abierta").length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Cerradas</p><p className="text-2xl font-semibold">{reclamaciones.filter(r => r.status === "cerrada").length}</p></CardContent></Card>
        <Card className={overdueCount > 0 ? "border-destructive/40" : ""}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vencidas</p>
            <p className={`text-2xl font-semibold ${overdueCount > 0 ? "text-destructive" : ""}`}>{overdueCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Reclamaciones</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 pr-9 w-[260px]" placeholder="Buscar reclamaciones..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} />
              {searchQuery && (
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground" onClick={() => onSearchChange("")}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {canEditContent && (
              <Button onClick={() => setIsNewOpen(true)}><Plus className="w-4 h-4 mr-1" />Nueva reclamación</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.map((rec) => {
            const status = statusConfig[rec.status] ?? statusConfig.abierta;
            const StatusIcon = status.icon;
            const responsibleName = getUserName(rec.responsible_id);
            const deadlineOverdue = rec.status !== "cerrada" && isOverdue(rec.response_deadline);
            const deadlineClose = rec.status !== "cerrada" && isDeadlineClose(rec.response_deadline);
            const linkedIncidencias = (reclamacionLinks[rec.id] ?? []).map(id => incidencias.find(i => i.id === id)).filter(Boolean);

            return (
              <div key={rec.id} className="rounded border p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEdit(rec)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{rec.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {sourceLabels[rec.source] || rec.source}
                      {rec.source_code && ` • ${rec.source_code}`}
                      {" • "}
                      {new Date(rec.opened_at).toLocaleDateString()}
                    </p>
                    {responsibleName && <p className="text-xs text-muted-foreground mt-0.5">Responsable: {responsibleName}</p>}
                    {linkedIncidencias.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <LinkIcon className="h-3 w-3 text-muted-foreground" />
                        {linkedIncidencias.map(inc => (
                          <span key={inc!.id} className="text-xs bg-warning/10 text-warning rounded-full px-1.5 py-0.5">{inc!.title}</span>
                        ))}
                      </div>
                    )}
                    {rec.response_deadline && (
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${deadlineOverdue ? "text-destructive font-medium" : deadlineClose ? "text-warning" : "text-muted-foreground"}`}>
                        <CalendarIcon className="h-3 w-3" />
                        Límite: {new Date(rec.response_deadline).toLocaleDateString()}
                        {deadlineOverdue && " (vencida)"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs flex items-center gap-1 ${status.color}`}><StatusIcon className="h-3 w-3" />{status.label}</span>
                    {canEditContent && <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
              </div>
            );
          })}
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Cargando reclamaciones...</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {searchQuery ? `No se encontraron resultados para "${searchQuery}".` : "No hay reclamaciones registradas todavía."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* New reclamacion dialog - NO incidencia linking */}
      <Dialog open={isNewOpen} onOpenChange={(open) => { setIsNewOpen(open); if (!open) { setNewAttachments([]); setSelectedIncidenciaIds([]); setParticipantIds([]); setForm(defaultForm()); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva reclamación</DialogTitle>
            <DialogDescription>Registra una nueva reclamación de proveedor, cliente u otra fuente.</DialogDescription>
          </DialogHeader>
          <ReclamacionFormFields
            form={form}
            onFormChange={setForm}
            users={users}
            attachments={newAttachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveNewAttachment}
            participantIds={participantIds}
            onParticipantToggle={(uid) => setParticipantIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])}
          />
          <DialogFooter><Button onClick={createReclamacion}>Crear reclamación</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit reclamacion dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingReclamacion(null); setNewAttachments([]); setExistingAttachments([]); setSelectedIncidenciaIds([]); setParticipantIds([]); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar reclamación</DialogTitle>
            {editingReclamacion && (
              <DialogDescription>
                Creada: {new Date(editingReclamacion.opened_at).toLocaleDateString()}
                {editingReclamacion.created_by && ` • ${getUserName(editingReclamacion.created_by)}`}
              </DialogDescription>
            )}
          </DialogHeader>
          <ReclamacionFormFields
            form={form}
            onFormChange={setForm}
            users={users}
            isEditing
            attachments={allAttachments}
            onAddFiles={canEditContent ? handleAddFiles : undefined}
            onRemoveAttachment={canEditContent ? (idx) => {
              if (idx < existingAttachments.length) {
                setExistingAttachments(prev => prev.filter((_, i) => i !== idx));
              } else {
                handleRemoveNewAttachment(idx - existingAttachments.length);
              }
            } : undefined}
            participantIds={participantIds}
            onParticipantToggle={canEditContent ? (uid) => setParticipantIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]) : undefined}
          />

          {/* Read-only linked incidencias */}
          {editingReclamacion && (reclamacionLinks[editingReclamacion.id]?.length > 0) && (
            <div className="space-y-1">
              <Label className="text-sm font-medium">Incidencias vinculadas</Label>
              <div className="flex flex-wrap gap-1">
                {reclamacionLinks[editingReclamacion.id]?.map((incId) => {
                  const inc = incidencias.find((i) => i.id === incId);
                  return (
                    <span key={incId} className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning rounded-full px-2 py-0.5">
                      <LinkIcon className="h-3 w-3" />{inc?.title || "Incidencia"}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <div className="w-full flex items-center justify-between gap-2">
              {canEditContent && editingReclamacion && onOpenNewIncident && (
                <Button variant="outline" onClick={() => handleOpenNewIncident(editingReclamacion)}>
                  <AlertTriangle className="w-4 h-4 mr-1" />Crear incidencia
                </Button>
              )}
              {!onOpenNewIncident && <span />}
              {canEditContent ? (
                <Button onClick={updateReclamacion}>Guardar cambios</Button>
              ) : (
                <p className="text-sm text-muted-foreground">Solo lectura</p>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
