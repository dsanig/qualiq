import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Filter, Link as LinkIcon, Plus, Search, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import type { FiltersState } from "@/components/filters/FilterModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { matchesNormalizedQuery } from "@/utils/search";

type IncidentType = "incidencia" | "reclamacion" | "desviacion" | "otra";

interface Incident {
  id: string;
  title: string;
  description: string | null;
  incidencia_type: IncidentType;
  audit_id: string | null;
  responsible_id: string | null;
  status: "open" | "in_progress" | "closed" | "overdue";
  created_at: string;
  created_by: string | null;
}

interface AuditRef { id: string; title: string; }
interface UserRef { id: string; full_name: string | null; email: string | null; }

interface IncidentsViewProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
  onOpenFilters: () => void;
  isNewIncidentOpen: boolean;
  onNewIncidentOpenChange: (open: boolean) => void;
  initialIncidentType?: IncidentType;
}

const typeLabels: Record<IncidentType, string> = {
  incidencia: "Incidencia",
  reclamacion: "Reclamación",
  desviacion: "Desviación",
  otra: "Otra",
};

const statusConfig = {
  open: { label: "Abierto", icon: AlertCircle, color: "text-destructive" },
  in_progress: { label: "En progreso", icon: Clock, color: "text-warning" },
  closed: { label: "Cerrado", icon: CheckCircle, color: "text-success" },
  overdue: { label: "Vencido", icon: AlertCircle, color: "text-warning" },
};

const defaultForm = (type?: IncidentType) => ({
  title: "",
  description: "",
  incidencia_type: type ?? ("incidencia" as IncidentType),
  audit_id: "none",
  responsible_id: "none",
  status: "open",
});

export function IncidentsView({
  searchQuery, onSearchChange, filters, onFiltersChange, onOpenFilters,
  isNewIncidentOpen, onNewIncidentOpenChange, initialIncidentType,
}: IncidentsViewProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audits, setAudits] = useState<AuditRef[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [form, setForm] = useState(defaultForm(initialIncidentType));
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { toast } = useToast();
  const { canEditContent } = usePermissions();

  const loadData = async () => {
    const [{ data: incidenciasData, error: incidenciasError }, { data: auditsData }, { data: usersData }] = await Promise.all([
      (supabase as any).from("incidencias").select("id,title,description,incidencia_type,audit_id,responsible_id,status,created_at,created_by").order("created_at", { ascending: false }),
      (supabase as any).from("audits").select("id,title").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id,full_name,email"),
    ]);
    if (incidenciasError) { toast({ title: "Error", description: incidenciasError.message, variant: "destructive" }); return; }
    setIncidents((incidenciasData ?? []) as Incident[]);
    setAudits((auditsData ?? []) as AuditRef[]);
    setUsers((usersData ?? []).map((u) => ({ id: u.user_id, full_name: u.full_name, email: u.email })) as UserRef[]);
  };

  useEffect(() => { void loadData(); }, []);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((i) => {
      const responsibleName = getUserName(i.responsible_id);
      const matchesQuery = matchesNormalizedQuery(
        debouncedSearchQuery,
        i.title,
        i.description,
        i.incidencia_type,
        i.status,
        responsibleName,
      );
      const matchesStatus = filters.incidentStatus === "all" || i.status === filters.incidentStatus;
      return matchesQuery && matchesStatus;
    });
  }, [incidents, debouncedSearchQuery, filters.incidentStatus, users]);

  const createIncident = async () => {
    const { data: profileData } = await supabase.from("profiles").select("company_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
    const { error } = await (supabase as any).from("incidencias").insert({
      title: form.title, description: form.description || null, incidencia_type: form.incidencia_type,
      audit_id: form.audit_id === "none" ? null : form.audit_id,
      responsible_id: form.responsible_id === "none" ? null : form.responsible_id,
      status: form.status, company_id: profileData?.company_id,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Incidencia creada" });
    onNewIncidentOpenChange(false);
    setForm(defaultForm(initialIncidentType));
    await loadData();
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
    });
    setIsEditOpen(true);
  };

  const updateIncident = async () => {
    if (!editingIncident) return;
    const { error } = await (supabase as any).from("incidencias").update({
      title: form.title, description: form.description || null, incidencia_type: form.incidencia_type,
      audit_id: form.audit_id === "none" ? null : form.audit_id,
      responsible_id: form.responsible_id === "none" ? null : form.responsible_id,
      status: form.status,
    }).eq("id", editingIncident.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Incidencia actualizada" });
    setIsEditOpen(false);
    setEditingIncident(null);
    setForm(defaultForm(initialIncidentType));
    await loadData();
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return null;
    const u = users.find((u) => u.id === userId);
    return u ? (u.full_name ?? u.email ?? userId) : null;
  };

  const renderFormFields = () => (
    <div className="space-y-3">
      <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></div>
      <div><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
      <div>
        <Label>Tipo</Label>
        <Select value={form.incidencia_type} onValueChange={(v: IncidentType) => setForm((p) => ({ ...p, incidencia_type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="incidencia">Incidencia</SelectItem>
            <SelectItem value="reclamacion">Reclamación</SelectItem>
            <SelectItem value="desviacion">Desviación</SelectItem>
            <SelectItem value="otra">Otra</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Auditoría relacionada (opcional)</Label>
        <Select value={form.audit_id} onValueChange={(v) => setForm((p) => ({ ...p, audit_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Sin auditoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin auditoría</SelectItem>
            {audits.map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Responsable</Label>
        <Select value={form.responsible_id} onValueChange={(v) => setForm((p) => ({ ...p, responsible_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Sin responsable" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin responsable</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Estado</Label>
        <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abierto</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="closed">Cerrado</SelectItem>
            <SelectItem value="overdue">Vencido</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-semibold">{incidents.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Abiertas</p><p className="text-2xl font-semibold">{incidents.filter((i) => i.status === "open").length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Cerradas</p><p className="text-2xl font-semibold">{incidents.filter((i) => i.status === "closed").length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Incidencias</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 pr-9 w-[260px]" placeholder="Buscar incidencias..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearchChange(searchQuery); }} />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                  onClick={() => onSearchChange("")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={onOpenFilters}><Filter className="w-4 h-4 mr-1" />Filtros</Button>
            <Button onClick={() => onNewIncidentOpenChange(true)} data-testid="incidents-new-button"><Plus className="w-4 h-4 mr-1" />Nueva incidencia</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredIncidents.map((incident) => {
            const status = statusConfig[incident.status] ?? statusConfig.open;
            const StatusIcon = status.icon;
            const auditTitle = audits.find((a) => a.id === incident.audit_id)?.title;
            const responsibleName = getUserName(incident.responsible_id);
            return (
              <div key={incident.id} className="rounded border p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEdit(incident)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{incident.title}</p>
                    <p className="text-sm text-muted-foreground">{typeLabels[incident.incidencia_type]} • {new Date(incident.created_at).toLocaleDateString()}</p>
                    {auditTitle && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><LinkIcon className="h-3 w-3" />Auditoría: {auditTitle}</p>}
                    {responsibleName && <p className="text-xs text-muted-foreground mt-0.5">Responsable: {responsibleName}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs flex items-center gap-1 ${status.color}`}><StatusIcon className="h-3 w-3" />{status.label}</span>
                    {canEditContent && <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredIncidents.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No se encontraron resultados para “{searchQuery}”.</p>
          )}
        </CardContent>
      </Card>

      {/* New incident dialog */}
      <Dialog open={isNewIncidentOpen} onOpenChange={onNewIncidentOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva incidencia</DialogTitle>
            <DialogDescription>Registra incidencia, reclamación, desviación u otra.</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter><Button onClick={createIncident}>Crear incidencia</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit incident dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingIncident(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar incidencia</DialogTitle>
            {editingIncident && (
              <DialogDescription>
                Creada por: {getUserName(editingIncident.created_by) ?? "Desconocido"} • {new Date(editingIncident.created_at).toLocaleDateString()}
              </DialogDescription>
            )}
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            {canEditContent ? (
              <Button onClick={updateIncident}>Guardar cambios</Button>
            ) : (
              <p className="text-sm text-muted-foreground">Solo lectura</p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
