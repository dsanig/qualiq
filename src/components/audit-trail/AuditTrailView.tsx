import { useEffect, useState, useCallback } from "react";
import {
  Shield, Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  User, FileText, AlertTriangle, ClipboardCheck, MessageSquare,
  Settings, Building2, GraduationCap, TrendingUp, FileWarning,
  LogIn, LogOut, Key, Eye, Download, Trash2
} from "lucide-react";
import * as XLSX from "xlsx";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  company_id: string | null;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_title: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const PAGE_SIZE = 50;

const entityTypeLabels: Record<string, string> = {
  auth: "Autenticación",
  document: "Documento",
  incident: "Incidencia",
  reclamacion: "Reclamación",
  audit: "Auditoría",
  capa: "Plan CAPA",
  non_conformity: "No Conformidad",
  action: "Acción CAPA",
  training: "Formación",
  training_exam: "Examen Formación",
  audit_simulation: "Simulador Auditoría",
  predictive_analytics: "Análisis Predictivo",
  chatbot: "QualAI",
  settings: "Configuración",
  company: "Empresa",
  user: "Usuario",
  document_responsibility: "Responsabilidad Doc.",
  document_signature: "Firma Doc.",
  document_share: "Compartir Doc.",
  system: "Sistema",
};

const entityTypeIcons: Record<string, typeof FileText> = {
  auth: LogIn,
  document: FileText,
  incident: AlertTriangle,
  reclamacion: FileWarning,
  audit: ClipboardCheck,
  capa: ClipboardCheck,
  non_conformity: AlertTriangle,
  action: ClipboardCheck,
  training: GraduationCap,
  training_exam: GraduationCap,
  audit_simulation: ClipboardCheck,
  predictive_analytics: TrendingUp,
  chatbot: MessageSquare,
  settings: Settings,
  company: Building2,
  user: User,
  document_responsibility: User,
  document_signature: Key,
  document_share: Eye,
  system: Shield,
};

const actionLabels: Record<string, string> = {
  login: "Inicio de sesión",
  logout: "Cierre de sesión",
  password_change: "Cambio de contraseña",
  mfa_enable: "Activar 2FA",
  mfa_disable: "Desactivar 2FA",
  mfa_verify: "Verificación 2FA",
  create: "Creación",
  update: "Actualización",
  delete: "Eliminación",
  status_change: "Cambio de estado",
  version_update: "Actualización de versión",
  sign: "Firma",
  share: "Compartir",
  download: "Descarga",
  lock: "Bloqueo",
  unlock: "Desbloqueo",
  assign: "Asignación",
  complete: "Completado",
  reject: "Denegación",
  view: "Visualización",
  send_message: "Mensaje enviado",
  start_simulation: "Iniciar simulación",
  start_analysis: "Iniciar análisis",
  acknowledge: "Marcar como leído",
  delete_insight: "Eliminar insight",
  export: "Exportación",
  transition: "Transición de estado",
  add_participant: "Añadir participante",
  remove_participant: "Eliminar participante",
  generate_exam: "Generar examen",
  submit_exam: "Entregar examen",
  sign_training: "Firma formación",
  feature_toggle: "Activar/desactivar módulo",
  email_change: "Cambio de email",
  create_user: "Crear usuario",
  delete_user: "Eliminar usuario",
};

const actionColors: Record<string, string> = {
  create: "bg-success/10 text-success",
  login: "bg-primary/10 text-primary",
  logout: "bg-muted text-muted-foreground",
  delete: "bg-destructive/10 text-destructive",
  update: "bg-accent/10 text-accent",
  status_change: "bg-warning/10 text-warning",
  reject: "bg-destructive/10 text-destructive",
  sign: "bg-success/10 text-success",
  password_change: "bg-warning/10 text-warning",
  mfa_enable: "bg-success/10 text-success",
  mfa_disable: "bg-destructive/10 text-destructive",
};

export function AuditTrailView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [uniqueUsers, setUniqueUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [uniqueEntityTypes, setUniqueEntityTypes] = useState<string[]>([]);
  const [uniqueActions, setUniqueActions] = useState<string[]>([]);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);

    let query = (supabase as any)
      .from("audit_trail")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (entityTypeFilter !== "all") query = query.eq("entity_type", entityTypeFilter);
    if (actionFilter !== "all") query = query.eq("action", actionFilter);
    if (userFilter !== "all") query = query.eq("user_id", userFilter);
    if (searchQuery.trim()) {
      query = query.or(
        `entity_title.ilike.%${searchQuery}%,user_name.ilike.%${searchQuery}%,user_email.ilike.%${searchQuery}%,action.ilike.%${searchQuery}%`
      );
    }

    const { data, error, count } = await query;

    if (!error && data) {
      setEntries(data as AuditEntry[]);
      setTotalCount(count ?? 0);
    }
    setIsLoading(false);
  }, [page, entityTypeFilter, actionFilter, userFilter, searchQuery]);

  const loadFilterOptions = useCallback(async () => {
    // Get unique users
    const { data: userData } = await (supabase as any)
      .from("audit_trail")
      .select("user_id, user_name")
      .order("user_name");

    if (userData) {
      const seen = new Map<string, string>();
      (userData as Array<{ user_id: string; user_name: string | null }>).forEach((u) => {
        if (!seen.has(u.user_id)) seen.set(u.user_id, u.user_name ?? u.user_id);
      });
      setUniqueUsers(Array.from(seen.entries()).map(([id, name]) => ({ id, name })));
    }

    // Get unique entity types
    const { data: etData } = await (supabase as any)
      .from("audit_trail")
      .select("entity_type");
    if (etData) {
      const types = [...new Set((etData as Array<{ entity_type: string }>).map((e) => e.entity_type))];
      setUniqueEntityTypes(types.sort());
    }

    // Get unique actions
    const { data: actionData } = await (supabase as any)
      .from("audit_trail")
      .select("action");
    if (actionData) {
      const actions = [...new Set((actionData as Array<{ action: string }>).map((e) => e.action))];
      setUniqueActions(actions.sort());
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const exportToExcel = async () => {
    // Fetch ALL entries (no pagination) for export
    let query = (supabase as any)
      .from("audit_trail")
      .select("*")
      .order("created_at", { ascending: false });

    if (entityTypeFilter !== "all") query = query.eq("entity_type", entityTypeFilter);
    if (actionFilter !== "all") query = query.eq("action", actionFilter);
    if (userFilter !== "all") query = query.eq("user_id", userFilter);
    if (searchQuery.trim()) {
      query = query.or(
        `entity_title.ilike.%${searchQuery}%,user_name.ilike.%${searchQuery}%,user_email.ilike.%${searchQuery}%,action.ilike.%${searchQuery}%`
      );
    }

    const { data } = await query;
    if (!data || data.length === 0) return;

    const rows = (data as AuditEntry[]).map((e) => ({
      "Fecha y hora": format(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss", { locale: es }),
      "Usuario": e.user_name ?? e.user_email ?? "Desconocido",
      "Email": e.user_email ?? "",
      "Acción": actionLabels[e.action] ?? e.action,
      "Módulo": entityTypeLabels[e.entity_type] ?? e.entity_type,
      "Elemento": e.entity_title ?? "",
      "Detalles": e.details ? Object.entries(e.details).map(([k, v]) => `${k}: ${String(v)}`).join("; ") : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pista de Auditoría");
    XLSX.writeFile(wb, `pista_auditoria_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`);
  };

  const deleteAllEntries = async () => {
    const { error } = await (supabase as any)
      .from("audit_trail")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows

    if (error) {
      toast.error("Error al eliminar la pista de auditoría");
      return;
    }
    toast.success("Pista de auditoría eliminada correctamente");
    setPage(0);
    loadEntries();
    loadFilterOptions();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Pista de Auditoría
              <Badge variant="secondary" className="ml-2">{totalCount} registros</Badge>
            </CardTitle>
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={totalCount === 0}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Eliminar todo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar toda la pista de auditoría?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción eliminará permanentemente los <strong>{totalCount} registros</strong> de la pista de auditoría. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteAllEntries} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Eliminar todo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" size="sm" onClick={exportToExcel}>
                <Download className="w-4 h-4 mr-1" />
                Exportar Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setPage(0); loadEntries(); loadFilterOptions(); }}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, usuario, acción..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                className="pl-10"
              />
            </div>
            <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los módulos</SelectItem>
                {uniqueEntityTypes.map((et) => (
                  <SelectItem key={et} value={et}>{entityTypeLabels[et] ?? et}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Acción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                {uniqueActions.map((a) => (
                  <SelectItem key={a} value={a}>{actionLabels[a] ?? a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <User className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Usuario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los usuarios</SelectItem>
                {uniqueUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entries list */}
          <div className="space-y-1">
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando pista de auditoría...</p>
            ) : entries.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No se encontraron registros.</p>
            ) : (
              entries.map((entry) => {
                const IconComponent = entityTypeIcons[entry.entity_type] ?? Shield;
                const colorClass = actionColors[entry.action] ?? "bg-secondary text-secondary-foreground";
                const date = new Date(entry.created_at);

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", colorClass)}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px]", colorClass)}>
                          {actionLabels[entry.action] ?? entry.action}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {entityTypeLabels[entry.entity_type] ?? entry.entity_type}
                        </Badge>
                        {entry.entity_title && (
                          <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
                            {entry.entity_title}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{entry.user_name ?? entry.user_email ?? "Desconocido"}</span>
                        <span>•</span>
                        <span>
                          {format(date, "dd MMM yyyy, HH:mm:ss", { locale: es })}
                        </span>
                      </div>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {Object.entries(entry.details).map(([key, value]) => (
                            <span key={key} className="mr-3">
                              <span className="font-medium">{key}:</span> {String(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {format(date, "HH:mm:ss")}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages} ({totalCount} registros)
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
