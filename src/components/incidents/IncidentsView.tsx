import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Filter, Link as LinkIcon, Plus, Search, Pencil, X, CalendarIcon, ClipboardList, Trash2, AlertTriangle, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuditLog } from "@/hooks/useAuditLog";
import type { FiltersState } from "@/components/filters/FilterModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { matchesNormalizedQuery } from "@/utils/search";
import { IncidentFormFields, type IncidentFormData, type CapaPlanRef } from "./IncidentFormFields";
import { format } from "date-fns";
import { StatusChangeDialog } from "@/components/shared/StatusChangeDialog";

type IncidentType = "incidencia" | "desviacion" | "no_conformidad" | "otra";

interface Incident {
  id: string;
  source_insight_id?: string | null;
  title: string;
  description: string | null;
  incidencia_type: IncidentType;
  audit_id: string | null;
  responsible_id: string | null;
  status: "open" | "in_progress" | "closed" | "overdue";
  created_at: string;
  created_by: string | null;
  deadline: string | null;
  resolution_notes: string | null;
}

interface AuditRef { id: string; title: string; }
interface UserRef { id: string; full_name: string | null; email: string | null; }

interface AttachmentInfo {
  id?: string;
  file_name: string;
  isNew?: boolean;
  file?: File;
}

interface IncidentPrefillPayload {
  title: string;
  description: string;
  sourceInsightId?: string;
  sourceReclamacionId?: string;
}

interface IncidentsViewProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
  onOpenFilters: () => void;
  isNewIncidentOpen: boolean;
  onNewIncidentOpenChange: (open: boolean) => void;
  initialIncidentType?: IncidentType;
  reloadToken?: number;
  prefill?: IncidentPrefillPayload | null;
  onPrefillConsumed?: () => void;
  openIncidentId?: string | null;
  onOpenIncidentConsumed?: () => void;
  onNavigateToReclamacion?: (reclamacionId: string) => void;
}

const typeLabels: Record<IncidentType, string> = {
  incidencia: "Incidencia",
  desviacion: "Desviación",
  no_conformidad: "No Conformidad",
  otra: "Otra",
};

const statusConfig = {
  open: { label: "Abierto", icon: AlertCircle, color: "text-destructive" },
  in_progress: { label: "En progreso", icon: Clock, color: "text-warning" },
  closed: { label: "Cerrado", icon: CheckCircle, color: "text-success" },
  overdue: { label: "Vencido", icon: AlertCircle, color: "text-warning" },
};

const defaultForm = (type?: IncidentType): IncidentFormData => ({
  title: "",
  description: "",
  incidencia_type: type ?? "incidencia",
  audit_id: "none",
  responsible_id: "none",
  status: "open",
  deadline: null,
  resolution_notes: "",
});

export function IncidentsView({
  searchQuery, onSearchChange, filters, onFiltersChange, onOpenFilters,
  isNewIncidentOpen, onNewIncidentOpenChange, initialIncidentType, reloadToken, prefill, onPrefillConsumed,
  openIncidentId, onOpenIncidentConsumed, onNavigateToReclamacion,
}: IncidentsViewProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audits, setAudits] = useState<AuditRef[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [capaPlans, setCapaPlans] = useState<CapaPlanRef[]>([]);
  const [incidentCapaLinks, setIncidentCapaLinks] = useState<Record<string, string[]>>({});
  const [incidentReclamacionLinks, setIncidentReclamacionLinks] = useState<Record<string, { id: string; title: string }[]>>({});
  const [selectedCapaPlanIds, setSelectedCapaPlanIds] = useState<string[]>([]);
  const [form, setForm] = useState<IncidentFormData>(defaultForm(initialIncidentType));
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [newAttachments, setNewAttachments] = useState<AttachmentInfo[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<AttachmentInfo[]>([]);
  const [sourceInsightId, setSourceInsightId] = useState<string | null>(null);
  const [sourceReclamacionId, setSourceReclamacionId] = useState<string | null>(null);
  const { toast } = useToast();
  const { canEditContent, isSuperadmin } = usePermissions();
  const [incidentPendingDelete, setIncidentPendingDelete] = useState<Incident | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStatusChangeOpen, setIsStatusChangeOpen] = useState(false);
  const { user } = useAuth();
  const { logAction } = useAuditLog();

  const canDeleteIncidencia = isSuperadmin;

  const handleCapaPlanToggle = (planId: string) => {
    setSelectedCapaPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId]
    );
  };

  const isMissingSourceInsightColumnError = (message: string) =>
    /does not exist/i.test(message) && /source_insight_id/i.test(message);

  const isPermissionError = (message: string, code?: string, status?: number) =>
    code === "42501" || status === 401 || status === 403 ||
    /permission|rls|policy|forbidden|not authorized|violates row level security/i.test(message);

  const getUserName = (userId: string | null | undefined) => {
    if (!userId) return null;
    const matchedUser = users.find((u) => u?.id === userId);
    return matchedUser?.full_name ?? matchedUser?.email ?? userId;
  };

  const formatIncidentDate = (dateValue: string | null | undefined) => {
    if (!dateValue) return "Fecha no disponible";
    const parsedDate = new Date(dateValue);
    return Number.isNaN(parsedDate.getTime()) ? "Fecha no disponible" : parsedDate.toLocaleDateString();
  };

  const loadData = async () => {
    setIsLoading(true);
    setLoadError(null);
    setPermissionDenied(false);

    try {
      const incidentsSelectWithInsight = "id,title,description,incidencia_type,audit_id,responsible_id,status,created_at,created_by,deadline,resolution_notes,source_insight_id";
      const incidentsSelectFallback = "id,title,description,incidencia_type,audit_id,responsible_id,status,created_at,created_by,deadline,resolution_notes";

      const incidentsPromise = (async () => {
        const withInsight = await (supabase as any)
          .from("incidencias")
          .select(incidentsSelectWithInsight)
          .order("created_at", { ascending: false });

        if (withInsight.error && isMissingSourceInsightColumnError(withInsight.error.message)) {
          if (import.meta.env.DEV) {
            console.info("[IncidentsView] Schema mismatch: source_insight_id missing; using fallback select");
          }

          return (supabase as any)
            .from("incidencias")
            .select(incidentsSelectFallback)
            .order("created_at", { ascending: false });
        }

        return withInsight;
      })();

      const [{ data: incidenciasData, error: incidenciasError }, { data: auditsData, error: auditsError }, { data: usersData, error: usersError }, { data: capaData }, { data: linksData }, { data: recLinksData }, { data: recData }] = await Promise.all([
        incidentsPromise,
        (supabase as any).from("audits").select("id,title").order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id,full_name,email"),
        (supabase as any).from("capa_plans").select("id,title,audit_id"),
        (supabase as any).from("incidencia_capa_plans").select("incidencia_id,capa_plan_id"),
        (supabase as any).from("reclamacion_incidencias").select("reclamacion_id,incidencia_id"),
        (supabase as any).from("reclamaciones").select("id,title"),
      ]);

      if (incidenciasError) {
        const denied = isPermissionError(incidenciasError.message, incidenciasError.code, (incidenciasError as any).status);
        setPermissionDenied(denied);
        setLoadError(denied ? "No tienes permisos para ver incidencias de esta empresa." : incidenciasError.message);
        setIncidents([]); setAudits([]); setUsers([]);
        toast({ title: "Error", description: denied ? "No tienes permisos para ver incidencias." : incidenciasError.message, variant: "destructive" });
        return;
      }

      if (auditsError) console.error("[IncidentsView] Error loading audits", auditsError);
      if (usersError) console.error("[IncidentsView] Error loading profiles", usersError);

      const safeIncidents = Array.isArray(incidenciasData) ? (incidenciasData as Incident[]) : [];
      const safeAudits = Array.isArray(auditsData) ? (auditsData as AuditRef[]).filter((a) => Boolean(a?.id) && Boolean(a?.title)) : [];
      const safeUsers = Array.isArray(usersData)
        ? usersData.map((u) => ({ id: u.user_id, full_name: u.full_name, email: u.email })).filter((u): u is UserRef => typeof u.id === "string" && u.id.trim().length > 0)
        : [];

      // Build CAPA plan refs with audit titles
      const auditMap = new Map(safeAudits.map((a) => [a.id, a.title]));
      const safeCapa: CapaPlanRef[] = Array.isArray(capaData)
        ? (capaData as any[]).map((c) => ({ id: c.id, title: c.title, auditTitle: auditMap.get(c.audit_id) ?? null }))
        : [];

      // Build links map: incidencia_id -> capa_plan_id[]
      const linksMap: Record<string, string[]> = {};
      if (Array.isArray(linksData)) {
        for (const link of linksData as any[]) {
          if (!linksMap[link.incidencia_id]) linksMap[link.incidencia_id] = [];
          linksMap[link.incidencia_id].push(link.capa_plan_id);
        }
      }

      // Build reclamacion links map: incidencia_id -> { id, title }[]
      const recTitleMap = new Map((Array.isArray(recData) ? recData : []).map((r: any) => [r.id, r.title]));
      const recLinksMap: Record<string, { id: string; title: string }[]> = {};
      if (Array.isArray(recLinksData)) {
        for (const link of recLinksData as any[]) {
          if (!recLinksMap[link.incidencia_id]) recLinksMap[link.incidencia_id] = [];
          const title = recTitleMap.get(link.reclamacion_id);
          if (title) recLinksMap[link.incidencia_id].push({ id: link.reclamacion_id, title });
        }
      }

      setIncidents(safeIncidents);
      setAudits(safeAudits);
      setUsers(safeUsers);
      setCapaPlans(safeCapa);
      setIncidentCapaLinks(linksMap);
      setIncidentReclamacionLinks(recLinksMap);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las incidencias.";
      const denied = isPermissionError(message);
      setPermissionDenied(denied);
      setLoadError(message);
      setIncidents([]); setAudits([]); setUsers([]);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [reloadToken]);

  // Auto-open a specific incident by ID (e.g. from reclamaciones navigation)
  useEffect(() => {
    if (!openIncidentId || incidents.length === 0) return;
    const incident = incidents.find((i) => i.id === openIncidentId);
    if (incident) {
      openEdit(incident);
      onOpenIncidentConsumed?.();
    }
  }, [openIncidentId, incidents]);

  useEffect(() => {
    if (!prefill || !isNewIncidentOpen) return;
    setForm((prev) => ({
      ...prev,
      title: prefill.title,
      description: prefill.description,
      incidencia_type: "incidencia",
    }));
    setSourceInsightId(prefill.sourceInsightId ?? null);
    setSourceReclamacionId(prefill.sourceReclamacionId ?? null);
    onPrefillConsumed?.();
  }, [prefill, isNewIncidentOpen, onPrefillConsumed]);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const filteredIncidents = useMemo(() => {
    return (incidents ?? []).filter((i) => {
      const responsibleName = getUserName(i.responsible_id);
      const matchesQuery = matchesNormalizedQuery(debouncedSearchQuery, i.title, i.description, i.incidencia_type, i.status, responsibleName);
      const matchesStatus = filters.incidentStatus === "all" || i.status === filters.incidentStatus;
      const matchesType = !("incidentType" in filters) || (filters as any).incidentType === "all" || i.incidencia_type === (filters as any).incidentType;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [incidents, debouncedSearchQuery, filters, users]);

  const uploadAttachments = async (incidenciaId: string) => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    for (const att of newAttachments) {
      if (!att.file) continue;
      const { data: pData } = await supabase.from("profiles").select("company_id").eq("user_id", userId ?? "").maybeSingle();
      const tenantPrefix = pData?.company_id ?? "unknown";
      const path = `${tenantPrefix}/incidencias/${incidenciaId}/${Date.now()}_${att.file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, att.file);
      if (uploadError) {
        console.error("Upload error", uploadError);
        toast({ title: "Error subiendo archivo", description: att.file.name, variant: "destructive" });
        continue;
      }
      await (supabase as any).from("incidencia_attachments").insert({
        incidencia_id: incidenciaId,
        object_path: path,
        file_name: att.file.name,
        file_type: att.file.type || "application/octet-stream",
        created_by: userId,
      });
    }
  };

  const createIncident = async () => {
    if (!form.responsible_id || form.responsible_id === "none") {
      toast({ title: "Error", description: "Debe asignar un responsable.", variant: "destructive" }); return;
    }
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data: profileData } = await supabase.from("profiles").select("company_id").eq("user_id", userId ?? "").maybeSingle();
    const baseIncidentPayload = {
      title: form.title, description: form.description || null, incidencia_type: form.incidencia_type,
      audit_id: form.audit_id === "none" ? null : form.audit_id,
      responsible_id: form.responsible_id === "none" ? null : form.responsible_id,
      status: form.status, company_id: profileData?.company_id,
      created_by: userId,
      deadline: form.deadline ? format(form.deadline, "yyyy-MM-dd") : null,
      resolution_notes: form.resolution_notes || null,
    };

    const insertWithSource = () =>
      (supabase as any)
        .from("incidencias")
        .insert({
          ...baseIncidentPayload,
          source_insight_id: sourceInsightId,
        })
        .select("id")
        .single();

    const insertWithoutSource = () =>
      (supabase as any)
        .from("incidencias")
        .insert(baseIncidentPayload)
        .select("id")
        .single();

    const insertResponse = sourceInsightId ? await insertWithSource() : await insertWithoutSource();

    const { data: inserted, error } = sourceInsightId && insertResponse.error && isMissingSourceInsightColumnError(insertResponse.error.message)
      ? await insertWithoutSource()
      : insertResponse;

    if (sourceInsightId && insertResponse.error && isMissingSourceInsightColumnError(insertResponse.error.message) && import.meta.env.DEV) {
      console.info("[IncidentsView] Schema mismatch: source_insight_id missing; creating incident without source linkage");
    }

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (inserted && newAttachments.length > 0) await uploadAttachments(inserted.id);

    // Save CAPA plan links
    if (inserted && selectedCapaPlanIds.length > 0) {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      await (supabase as any).from("incidencia_capa_plans").insert(
        selectedCapaPlanIds.map((planId) => ({
          incidencia_id: inserted.id,
          capa_plan_id: planId,
          created_by: userId,
        }))
      );
    }

    // Auto-link to source reclamacion
    if (inserted && sourceReclamacionId) {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      await (supabase as any).from("reclamacion_incidencias").insert({
        reclamacion_id: sourceReclamacionId,
        incidencia_id: inserted.id,
        created_by: userId,
      });
    }

    toast({ title: "Incidencia creada" });
    onNewIncidentOpenChange(false);
    setForm(defaultForm(initialIncidentType));
    setNewAttachments([]);
    setSelectedCapaPlanIds([]);
    setSourceInsightId(null);
    setSourceReclamacionId(null);
    await loadData();
  };

  const loadExistingAttachments = async (incidenciaId: string) => {
    const { data } = await (supabase as any).from("incidencia_attachments").select("id,file_name").eq("incidencia_id", incidenciaId);
    setExistingAttachments(Array.isArray(data) ? data.map((a: any) => ({ id: a.id, file_name: a.file_name ?? "archivo" })) : []);
  };

  const openEdit = (incident: Incident) => {
    setEditingIncident(incident);
    setForm({
      title: incident.title,
      description: incident.description ?? "",
      incidencia_type: incident.incidencia_type,
      audit_id: incident.audit_id ?? "none",
      responsible_id: incident.responsible_id ?? "none",
      status: incident.status,
      deadline: incident.deadline ? new Date(incident.deadline) : null,
      resolution_notes: incident.resolution_notes ?? "",
    });
    setNewAttachments([]);
    setSelectedCapaPlanIds(incidentCapaLinks[incident.id] ?? []);
    void loadExistingAttachments(incident.id);
    setIsEditOpen(true);
  };

  const syncCapaLinks = async (incidenciaId: string) => {
    const existingLinks = incidentCapaLinks[incidenciaId] ?? [];
    const toAdd = selectedCapaPlanIds.filter((id) => !existingLinks.includes(id));
    const toRemove = existingLinks.filter((id) => !selectedCapaPlanIds.includes(id));
    const userId = (await supabase.auth.getUser()).data.user?.id;

    if (toRemove.length > 0) {
      await (supabase as any)
        .from("incidencia_capa_plans")
        .delete()
        .eq("incidencia_id", incidenciaId)
        .in("capa_plan_id", toRemove);
    }
    if (toAdd.length > 0) {
      await (supabase as any).from("incidencia_capa_plans").insert(
        toAdd.map((planId) => ({ incidencia_id: incidenciaId, capa_plan_id: planId, created_by: userId }))
      );
    }
  };

  const updateIncident = async () => {
    if (!editingIncident) return;
    if (!form.responsible_id || form.responsible_id === "none") {
      toast({ title: "Error", description: "Debe asignar un responsable.", variant: "destructive" }); return;
    }
    const { error } = await (supabase as any).from("incidencias").update({
      title: form.title, description: form.description || null, incidencia_type: form.incidencia_type,
      audit_id: form.audit_id === "none" ? null : form.audit_id,
      responsible_id: form.responsible_id === "none" ? null : form.responsible_id,
      deadline: form.deadline ? format(form.deadline, "yyyy-MM-dd") : null,
      resolution_notes: form.resolution_notes || null,
    }).eq("id", editingIncident.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (newAttachments.length > 0) await uploadAttachments(editingIncident.id);
    await syncCapaLinks(editingIncident.id);
    toast({ title: "Incidencia actualizada" });
    setIsEditOpen(false);
    setEditingIncident(null);
    setForm(defaultForm(initialIncidentType));
    setNewAttachments([]);
    setExistingAttachments([]);
    setSelectedCapaPlanIds([]);
    setSourceInsightId(null);
    setSourceReclamacionId(null);
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

  const [incidentLinkedInfo, setIncidentLinkedInfo] = useState<string[]>([]);

  const promptDeleteIncident = async (incident: Incident) => {
    if (!canDeleteIncidencia) return;

    // Check linked records
    const links: string[] = [];
    const [
      { count: capaCount },
      { count: attachCount },
      { count: reclamacionCount },
    ] = await Promise.all([
      supabase.from("incidencia_capa_plans").select("id", { count: "exact", head: true }).eq("incidencia_id", incident.id),
      supabase.from("incidencia_attachments").select("id", { count: "exact", head: true }).eq("incidencia_id", incident.id),
      supabase.from("reclamacion_incidencias").select("id", { count: "exact", head: true }).eq("incidencia_id", incident.id),
    ]);

    if (capaCount && capaCount > 0) links.push(`${capaCount} plan(es) CAPA vinculado(s)`);
    if (attachCount && attachCount > 0) links.push(`${attachCount} adjunto(s)`);
    if (reclamacionCount && reclamacionCount > 0) links.push(`${reclamacionCount} reclamación(es) vinculada(s)`);

    setIncidentLinkedInfo(links);
    setIncidentPendingDelete(incident);
    setDeleteConfirmationText("");
  };

  const handleDeleteIncident = async () => {
    if (!incidentPendingDelete || !canDeleteIncidencia || isDeleting) return;
    if (deleteConfirmationText !== "ELIMINAR") return;

    const pendingIncidentId = incidentPendingDelete.id;

    setIsDeleting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        console.error("[IncidentsView] Missing/invalid session when deleting incidencia", {
          incidenciaId: pendingIncidentId,
          sessionError,
        });
        toast({
          title: "No se pudo eliminar la incidencia",
          description: "Sesión no válida. Vuelva a iniciar sesión.",
          variant: "destructive",
        });
        return;
      }

      const {
        data: deleteResult,
        error,
      } = await supabase.functions.invoke<{ success?: boolean; message?: string }>("delete-incidencia", {
        body: {
          incidenciaId: pendingIncidentId,
        },
      });

      if (error) {
        console.error("Delete incidencia error:", error);

        toast({
          title: "No se pudo eliminar la incidencia",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (!deleteResult?.success) {
        toast({
          title: "No se pudo eliminar la incidencia",
          description: deleteResult?.message || "La función de eliminación respondió con un estado no válido.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: deleteResult.message || "Incidencia eliminada correctamente" });
      setIncidentPendingDelete(null);
      setDeleteConfirmationText("");
      if (editingIncident?.id === pendingIncidentId) {
        setIsEditOpen(false);
        setEditingIncident(null);
      }
      await loadData();
    } finally {
      setIsDeleting(false);
    }
  };

  const isDeadlineClose = (deadline: string | null) => {
    if (!deadline) return false;
    const d = new Date(deadline);
    const diff = d.getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // 3 days
  };

  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline).getTime() < Date.now();
  };

  const overdueCount = incidents.filter((i) => i.status !== "closed" && isOverdue(i.deadline)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-semibold">{incidents.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Abiertas</p><p className="text-2xl font-semibold">{incidents.filter((i) => i.status === "open").length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Cerradas</p><p className="text-2xl font-semibold">{incidents.filter((i) => i.status === "closed").length}</p></CardContent></Card>
        <Card className={overdueCount > 0 ? "border-destructive/40" : ""}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vencidas</p>
            <p className={`text-2xl font-semibold ${overdueCount > 0 ? "text-destructive" : ""}`}>{overdueCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Incidencias</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 pr-9 w-[260px]" placeholder="Buscar incidencias..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearchChange(searchQuery); }} />
              {searchQuery && (
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground" onClick={() => onSearchChange("")}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={onOpenFilters}><Filter className="w-4 h-4 mr-1" />Filtros</Button>
            <Button onClick={() => { setForm(defaultForm(initialIncidentType)); setNewAttachments([]); setSelectedCapaPlanIds([]); setSourceInsightId(null); setSourceReclamacionId(null); onNewIncidentOpenChange(true); }} data-testid="incidents-new-button"><Plus className="w-4 h-4 mr-1" />Nueva incidencia</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(filteredIncidents ?? []).map((incident) => {
            const status = statusConfig[incident.status] ?? statusConfig.open;
            const StatusIcon = status.icon;
            const auditTitle = audits.find((a) => a.id === incident.audit_id)?.title;
            const responsibleName = getUserName(incident.responsible_id);
            const deadlineOverdue = incident.status !== "closed" && isOverdue(incident.deadline);
            const deadlineClose = incident.status !== "closed" && isDeadlineClose(incident.deadline);
            const linkedCapas = (incidentCapaLinks[incident.id] ?? [])
              .map((id) => capaPlans.find((p) => p.id === id))
              .filter(Boolean);
            return (
              <div key={incident.id} className="rounded border p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEdit(incident)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{incident.title}</p>
                    <p className="text-sm text-muted-foreground">{typeLabels[incident.incidencia_type] ?? "Incidencia"} • {formatIncidentDate(incident.created_at)}</p>
                    {auditTitle && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><LinkIcon className="h-3 w-3" />Auditoría: {auditTitle}</p>}
                    {responsibleName && <p className="text-xs text-muted-foreground mt-0.5">Responsable: {responsibleName}</p>}
                    {linkedCapas.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <ClipboardList className="h-3 w-3 text-muted-foreground" />
                        {linkedCapas.map((plan) => (
                          <span key={plan!.id} className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                            {plan!.title || "Plan CAPA"}
                          </span>
                        ))}
                      </div>
                    )}
                    {incident.deadline && (
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${deadlineOverdue ? "text-destructive font-medium" : deadlineClose ? "text-warning" : "text-muted-foreground"}`}>
                        <CalendarIcon className="h-3 w-3" />
                        Fecha límite: {new Date(incident.deadline).toLocaleDateString()}
                        {deadlineOverdue && " (vencida)"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs flex items-center gap-1 ${status.color}`}><StatusIcon className="h-3 w-3" />{status.label}</span>
                    {canDeleteIncidencia && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          promptDeleteIncident(incident);
                        }}
                        aria-label={`Eliminar incidencia ${incident.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {user?.id === incident.responsible_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingIncident(incident);
                          setIsStatusChangeOpen(true);
                        }}
                      >
                        <History className="h-3 w-3 mr-1" />Estado
                      </Button>
                    )}
                    {canEditContent && <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
              </div>
            );
          })}
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Cargando incidencias...</p>}
          {!isLoading && loadError && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">{permissionDenied ? "No tienes permisos" : "Error cargando incidencias"}</p>
              <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
              {permissionDenied && <p className="text-sm text-muted-foreground mt-1">Contacta con el administrador.</p>}
              <Button variant="outline" className="mt-3" onClick={() => void loadData()}>Reintentar</Button>
            </div>
          )}
          {!isLoading && !loadError && filteredIncidents.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {searchQuery ? `No se encontraron resultados para "${searchQuery}".` : "No hay incidencias registradas todavía."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* New incident dialog */}
      <Dialog open={isNewIncidentOpen} onOpenChange={(open) => { onNewIncidentOpenChange(open); if (!open) { setNewAttachments([]); setSelectedCapaPlanIds([]); setForm(defaultForm(initialIncidentType)); setSourceInsightId(null); setSourceReclamacionId(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva incidencia</DialogTitle>
            <DialogDescription>Registra incidencia, reclamación, desviación u otra.</DialogDescription>
          </DialogHeader>
          <IncidentFormFields
            form={form}
            onFormChange={setForm}
            audits={audits}
            users={users}
            attachments={newAttachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveNewAttachment}
            capaPlans={capaPlans}
            selectedCapaPlanIds={selectedCapaPlanIds}
            onCapaPlanToggle={handleCapaPlanToggle}
          />
          <DialogFooter><Button onClick={createIncident}>Crear incidencia</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit incident dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingIncident(null); setNewAttachments([]); setExistingAttachments([]); setSelectedCapaPlanIds([]); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar incidencia</DialogTitle>
            {editingIncident && (
              <DialogDescription>
                Creada por: {getUserName(editingIncident.created_by) ?? "Desconocido"} • {formatIncidentDate(editingIncident.created_at)}
              </DialogDescription>
            )}
          </DialogHeader>
          <IncidentFormFields
            form={form}
            onFormChange={setForm}
            audits={audits}
            users={users}
            isEditing
            attachments={allAttachments}
            onAddFiles={canEditContent ? handleAddFiles : undefined}
            onRemoveAttachment={canEditContent ? (idx) => {
              if (idx < existingAttachments.length) {
                setExistingAttachments((prev) => prev.filter((_, i) => i !== idx));
              } else {
                handleRemoveNewAttachment(idx - existingAttachments.length);
              }
            } : undefined}
            capaPlans={capaPlans}
            selectedCapaPlanIds={selectedCapaPlanIds}
            onCapaPlanToggle={canEditContent ? handleCapaPlanToggle : undefined}
          />
          {/* Read-only linked reclamaciones */}
          {editingIncident && (incidentReclamacionLinks[editingIncident.id]?.length > 0) && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Reclamación de origen</p>
              <div className="flex flex-wrap gap-1">
                {incidentReclamacionLinks[editingIncident.id].map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning rounded-full px-2 py-0.5 hover:bg-warning/20 transition-colors cursor-pointer"
                    onClick={() => {
                      setIsEditOpen(false);
                      setEditingIncident(null);
                      onNavigateToReclamacion?.(rec.id);
                    }}
                  >
                    <LinkIcon className="h-3 w-3" />{rec.title} →
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {canDeleteIncidencia && editingIncident ? (
                  <Button variant="destructive" onClick={() => promptDeleteIncident(editingIncident)}>
                    <Trash2 className="w-4 h-4 mr-1" />Eliminar
                  </Button>
                ) : <span />}
                {editingIncident && user?.id === editingIncident.responsible_id && (
                  <Button variant="outline" onClick={() => setIsStatusChangeOpen(true)}>
                    <History className="w-4 h-4 mr-1" />Cambiar Estado
                  </Button>
                )}
              </div>
              {canEditContent ? (
                <Button onClick={updateIncident}>Guardar cambios</Button>
              ) : (
                <p className="text-sm text-muted-foreground">Solo lectura</p>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      {editingIncident && (
        <StatusChangeDialog
          open={isStatusChangeOpen}
          onOpenChange={setIsStatusChangeOpen}
          currentStatus={editingIncident.status}
          statusOptions={[
            { value: "open", label: "Abierto" },
            { value: "in_progress", label: "En progreso" },
            { value: "closed", label: "Cerrado" },
            { value: "overdue", label: "Vencido" },
          ]}
          entityId={editingIncident.id}
          entityType="incidencias"
          historyTable="incidencia_status_changes"
          foreignKey="incidencia_id"
          onStatusChanged={async () => {
            setIsEditOpen(false);
            setEditingIncident(null);
            await loadData();
          }}
          getUserName={getUserName}
        />
      )}

      <AlertDialog open={Boolean(incidentPendingDelete)} onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setIncidentPendingDelete(null);
          setDeleteConfirmationText("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              Está a punto de eliminar esta incidencia de forma permanente. Esta acción no se puede deshacer. ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {incidentPendingDelete && (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Incidencia: {incidentPendingDelete.title}</p>
                <p className="text-muted-foreground mt-1">Solo el Superadmin puede realizar esta acción irreversible.</p>
                {incidentLinkedInfo.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-destructive">⚠️ Esta incidencia está vinculada a:</p>
                    <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                      {incidentLinkedInfo.map((info, i) => (
                        <li key={i}>{info}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-1">Todos estos registros serán eliminados junto con la incidencia.</p>
                  </div>
                )}
                {incidentLinkedInfo.length === 0 && (
                  <p className="text-muted-foreground mt-1">Esta incidencia no tiene registros vinculados.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">Escriba ELIMINAR para confirmar la eliminación de esta incidencia.</p>
                <Input
                  value={deleteConfirmationText}
                  onChange={(event) => setDeleteConfirmationText(event.target.value)}
                  placeholder="ELIMINAR"
                  disabled={isDeleting}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteIncident();
              }}
              disabled={isDeleting || deleteConfirmationText !== "ELIMINAR"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Eliminando..." : "Eliminar incidencia"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
