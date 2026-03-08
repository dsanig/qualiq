import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Users, ExternalLink, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const USER_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-400", dot: "bg-blue-500" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-400", dot: "bg-emerald-500" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-400", dot: "bg-amber-500" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-400", dot: "bg-purple-500" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300", border: "border-rose-400", dot: "bg-rose-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-400", dot: "bg-cyan-500" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-400", dot: "bg-orange-500" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-400", dot: "bg-indigo-500" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-300", border: "border-pink-400", dot: "bg-pink-500" },
  { bg: "bg-teal-100 dark:bg-teal-900/40", text: "text-teal-700 dark:text-teal-300", border: "border-teal-400", dot: "bg-teal-500" },
];

type EventType = "doc_responsibility" | "incident" | "reclamacion" | "audit" | "training" | "non_conformity" | "capa_action" | "doc_effective" | "doc_expiry";

interface CalendarEvent {
  id: string;
  sourceId: string;
  title: string;
  date: string;
  type: EventType;
  userId: string;
  userName: string;
  typeLabel: string;
  documentCode?: string;
  companyWide?: boolean;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
  colorIndex: number;
  visible: boolean;
}

interface CalendarViewProps {
  onNavigateToIncident?: (incidentId: string) => void;
  onNavigateToReclamacion?: (reclamacionId: string) => void;
  onNavigateToAudit?: (module: string) => void;
  onNavigateToTraining?: (module: string) => void;
  onNavigateToDocument?: (documentCode: string) => void;
  onNavigateToPendingActions?: () => void;
}

const EVENT_TYPE_CONFIG: Record<EventType, { label: string; color: string }> = {
  doc_responsibility: { label: "Resp. Documental", color: "bg-sky-500" },
  incident: { label: "Incidencias", color: "bg-amber-500" },
  reclamacion: { label: "Reclamaciones", color: "bg-rose-500" },
  audit: { label: "Auditorías", color: "bg-indigo-500" },
  training: { label: "Formaciones", color: "bg-emerald-500" },
  non_conformity: { label: "No Conformidades", color: "bg-orange-500" },
  capa_action: { label: "Acciones CAPA", color: "bg-purple-500" },
  doc_effective: { label: "Vigencia documento", color: "bg-green-600" },
  doc_expiry: { label: "Caducidad documento", color: "bg-red-500" },
};

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_CONFIG) as EventType[];

export function CalendarView({
  onNavigateToIncident,
  onNavigateToReclamacion,
  onNavigateToAudit,
  onNavigateToTraining,
  onNavigateToDocument,
  onNavigateToPendingActions,
}: CalendarViewProps) {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showUserPanel, setShowUserPanel] = useState(true);
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    if (!user) return;
    const fetchUsers = async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      if (profiles) {
        const mapped: UserInfo[] = profiles.map((p, i) => ({
          id: p.user_id,
          name: p.full_name || p.email,
          email: p.email,
          colorIndex: i % USER_COLORS.length,
          visible: true,
        }));
        mapped.sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : a.name.localeCompare(b.name)));
        setUsers(mapped);
      }
    };
    fetchUsers();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchEvents = async () => {
      setLoading(true);
      const allEvents: CalendarEvent[] = [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      const userMap = new Map<string, string>();
      profiles?.forEach((p) => userMap.set(p.user_id, p.full_name || p.email));
      const getName = (uid: string | null) => (uid ? userMap.get(uid) || "Sin asignar" : "Sin asignar");

      // 1. Document responsibilities
      const { data: docResps } = await supabase
        .from("document_responsibilities")
        .select("id, user_id, due_date, action_type, document_id, documents(title, code)");
      docResps?.forEach((r: any) => {
        if (r.due_date) {
          allEvents.push({
            id: `docresp-${r.id}`,
            sourceId: r.document_id,
            title: `${r.action_type === "firma" ? "Firma" : r.action_type === "aprobacion" ? "Aprobación" : "Revisión"}: ${r.documents?.title || "Documento"}`,
            date: r.due_date,
            type: "doc_responsibility",
            userId: r.user_id,
            userName: getName(r.user_id),
            typeLabel: EVENT_TYPE_CONFIG.doc_responsibility.label,
            documentCode: r.documents?.code,
          });
        }
      });

      // 2. Incidencias
      const { data: incidents } = await supabase
        .from("incidencias")
        .select("id, title, deadline, responsible_id");
      incidents?.forEach((inc) => {
        if (inc.deadline && inc.responsible_id) {
          allEvents.push({
            id: `inc-${inc.id}`,
            sourceId: inc.id,
            title: inc.title,
            date: inc.deadline,
            type: "incident",
            userId: inc.responsible_id,
            userName: getName(inc.responsible_id),
            typeLabel: EVENT_TYPE_CONFIG.incident.label,
          });
        }
      });

      // 3. Reclamaciones
      const { data: recs } = await supabase
        .from("reclamaciones")
        .select("id, title, response_deadline, responsible_id");
      recs?.forEach((r) => {
        if (r.response_deadline && r.responsible_id) {
          allEvents.push({
            id: `rec-${r.id}`,
            sourceId: r.id,
            title: r.title,
            date: r.response_deadline,
            type: "reclamacion",
            userId: r.responsible_id,
            userName: getName(r.responsible_id),
            typeLabel: EVENT_TYPE_CONFIG.reclamacion.label,
          });
        }
      });

      // 4. Audits
      const { data: audits } = await supabase
        .from("audits")
        .select("id, title, audit_date, responsible_id");
      audits?.forEach((a) => {
        if (a.audit_date && a.responsible_id) {
          allEvents.push({
            id: `audit-${a.id}`,
            sourceId: a.id,
            title: a.title,
            date: a.audit_date,
            type: "audit",
            userId: a.responsible_id,
            userName: getName(a.responsible_id),
            typeLabel: EVENT_TYPE_CONFIG.audit.label,
          });
        }
      });

      // 5. Training records
      const { data: trainings } = await supabase
        .from("training_records")
        .select("id, title, deadline, created_by");
      trainings?.forEach((t) => {
        if (t.deadline) {
          allEvents.push({
            id: `train-${t.id}`,
            sourceId: t.id,
            title: t.title,
            date: t.deadline,
            type: "training",
            userId: t.created_by,
            userName: getName(t.created_by),
            typeLabel: EVENT_TYPE_CONFIG.training.label,
          });
        }
      });

      // 6. Non-conformities
      const { data: ncs } = await supabase
        .from("non_conformities")
        .select("id, title, deadline, responsible_id");
      ncs?.forEach((nc) => {
        if (nc.deadline && nc.responsible_id) {
          allEvents.push({
            id: `nc-${nc.id}`,
            sourceId: nc.id,
            title: nc.title,
            date: nc.deadline,
            type: "non_conformity",
            userId: nc.responsible_id,
            userName: getName(nc.responsible_id),
            typeLabel: EVENT_TYPE_CONFIG.non_conformity.label,
          });
        }
      });

      // 7. CAPA Actions (corrective/preventive actions)
      const { data: actions } = await supabase
        .from("actions")
        .select("id, description, due_date, responsible_id, action_type, status");
      actions?.forEach((a) => {
        if (a.due_date && a.responsible_id) {
          const typeStr = a.action_type === "preventiva" ? "Acción Preventiva" : a.action_type === "correctiva" ? "Acción Correctiva" : "Acción CAPA";
          allEvents.push({
            id: `action-${a.id}`,
            sourceId: a.id,
            title: `${typeStr}: ${a.description?.substring(0, 60) || "Sin descripción"}`,
            date: a.due_date,
            type: "capa_action",
            userId: a.responsible_id,
            userName: getName(a.responsible_id),
            typeLabel: EVENT_TYPE_CONFIG.capa_action.label,
          });
        }
      });

      // 8. Document effective dates
      const { data: docsWithDates } = await supabase
        .from("documents")
        .select("id, title, code, effective_date, expiry_date, owner_id" as any);
      (docsWithDates as any[])?.forEach((doc: any) => {
        if (doc.effective_date) {
          allEvents.push({
            id: `doceff-${doc.id}`,
            sourceId: doc.id,
            title: `"${doc.title}" entra en efecto`,
            date: doc.effective_date,
            type: "doc_effective",
            userId: doc.owner_id,
            userName: "Todos",
            typeLabel: EVENT_TYPE_CONFIG.doc_effective.label,
            documentCode: doc.code,
            companyWide: true,
          });
        }
        if (doc.expiry_date) {
          allEvents.push({
            id: `docexp-${doc.id}`,
            sourceId: doc.id,
            title: `"${doc.title}" caduca`,
            date: doc.expiry_date,
            type: "doc_expiry",
            userId: doc.owner_id,
            userName: "Todos",
            typeLabel: EVENT_TYPE_CONFIG.doc_expiry.label,
            documentCode: doc.code,
            companyWide: true,
          });
        }
      });

      setEvents(allEvents);
      setLoading(false);
    };
    fetchEvents();
  }, [user]);

  const handleEventClick = useCallback((ev: CalendarEvent) => {
    if (ev.userId !== user?.id) return;

    switch (ev.type) {
      case "incident":
        onNavigateToIncident?.(ev.sourceId);
        break;
      case "reclamacion":
        onNavigateToReclamacion?.(ev.sourceId);
        break;
      case "audit":
      case "non_conformity":
      case "capa_action":
        onNavigateToAudit?.("audits");
        break;
      case "training":
        onNavigateToTraining?.("training");
        break;
      case "doc_responsibility":
        if (ev.documentCode) {
          onNavigateToDocument?.(ev.documentCode);
        } else {
          onNavigateToPendingActions?.();
        }
        break;
    }
  }, [user, onNavigateToIncident, onNavigateToReclamacion, onNavigateToAudit, onNavigateToTraining, onNavigateToDocument, onNavigateToPendingActions]);

  const toggleTypeFilter = useCallback((type: EventType) => {
    setActiveTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleAllTypes = useCallback((on: boolean) => {
    setActiveTypeFilters(on ? new Set(ALL_EVENT_TYPES) : new Set());
  }, []);

  const toggleUser = useCallback((userId: string) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, visible: !u.visible } : u)));
  }, []);

  const toggleAllUsers = useCallback((visible: boolean) => {
    setUsers((prev) => prev.map((u) => ({ ...u, visible })));
  }, []);

  const visibleUserIds = useMemo(() => new Set(users.filter((u) => u.visible).map((u) => u.id)), [users]);
  const userColorMap = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => map.set(u.id, u.colorIndex));
    return map;
  }, [users]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const filteredEvents = useMemo(
    () => events.filter((e) => (e.companyWide || visibleUserIds.has(e.userId)) && activeTypeFilters.has(e.type)),
    [events, visibleUserIds, activeTypeFilters]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((e) => {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [filteredEvents]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const monthName = currentDate.toLocaleString("es-ES", { month: "long", year: "numeric" });
  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const selectedEvents = selectedDay ? eventsByDate.get(selectedDay) || [] : [];
  const isOwnEvent = (ev: CalendarEvent) => ev.userId === user?.id;

  return (
    <div className="flex gap-4 h-full">
      {/* User sidebar */}
      {showUserPanel && (
        <Card className="w-64 flex-shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Usuarios
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex gap-1 mb-3">
              <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => toggleAllUsers(true)}>
                <Eye className="w-3 h-3 mr-1" /> Todos
              </Button>
              <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => toggleAllUsers(false)}>
                <EyeOff className="w-3 h-3 mr-1" /> Ninguno
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="space-y-1">
                {users.map((u) => {
                  const color = USER_COLORS[u.colorIndex];
                  return (
                    <label
                      key={u.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted transition-colors text-sm",
                        !u.visible && "opacity-50"
                      )}
                    >
                      <Checkbox checked={u.visible} onCheckedChange={() => toggleUser(u.id)} />
                      <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", color.dot)} />
                      <span className="truncate">
                        {u.id === user?.id ? `${u.name} (Tú)` : u.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Main calendar area */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Header with nav */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setShowUserPanel(!showUserPanel)}>
                <Users className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <h2 className="text-lg font-semibold capitalize ml-2">{monthName}</h2>
            </div>
            <Button variant="outline" size="sm" onClick={goToday}>
              Hoy
            </Button>
          </CardContent>
        </Card>

        {/* Type filters */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 mr-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
              </div>
              {ALL_EVENT_TYPES.map((type) => {
                const config = EVENT_TYPE_CONFIG[type];
                const isActive = activeTypeFilters.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                      isActive
                        ? "bg-foreground/10 border-foreground/20 text-foreground"
                        : "bg-muted/50 border-transparent text-muted-foreground opacity-50"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", config.color)} />
                    {config.label}
                  </button>
                );
              })}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => toggleAllTypes(true)}>
                  Todos
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => toggleAllTypes(false)}>
                  Ninguno
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar grid */}
        <Card className="flex-1">
          <CardContent className="p-2">
            {loading ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">Cargando calendario...</div>
            ) : (
              <div className="grid grid-cols-7 gap-px">
                {weekDays.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {d}
                  </div>
                ))}

                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[80px] bg-muted/30 rounded-sm" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDay;

                  return (
                    <div
                      key={dateStr}
                      onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                      className={cn(
                        "min-h-[80px] p-1 rounded-sm border cursor-pointer transition-colors",
                        isToday ? "border-primary bg-primary/5" : "border-transparent hover:border-border",
                        isSelected && "ring-2 ring-primary/50 bg-primary/10"
                      )}
                    >
                      <div className={cn("text-xs font-medium mb-1", isToday ? "text-primary font-bold" : "text-foreground")}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const colorIdx = userColorMap.get(ev.userId) ?? 0;
                          const color = USER_COLORS[colorIdx];
                          return (
                            <div
                              key={ev.id}
                              className={cn("text-[10px] leading-tight px-1 py-0.5 rounded truncate flex items-center gap-1", color.bg, color.text)}
                              title={`${ev.typeLabel}: ${ev.title} (${ev.userName})`}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", EVENT_TYPE_CONFIG[ev.type].color)} />
                              {ev.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} más</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected day details */}
        {selectedDay && (
          <Card className="min-h-[40vh]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Eventos del {new Date(selectedDay + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ScrollArea className="h-[calc(40vh-60px)]">
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay eventos para este día.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((ev) => {
                    const colorIdx = userColorMap.get(ev.userId) ?? 0;
                    const color = USER_COLORS[colorIdx];
                    const canNavigate = isOwnEvent(ev);
                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canNavigate) handleEventClick(ev);
                        }}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-md border-l-4",
                          color.bg,
                          color.border,
                          canNavigate && "cursor-pointer hover:opacity-80 transition-opacity"
                        )}
                      >
                        <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", color.dot)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ev.title}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">{ev.userName}</p>
                            <span className={cn("inline-block w-1.5 h-1.5 rounded-full", EVENT_TYPE_CONFIG[ev.type].color)} />
                            <span className="text-[10px] text-muted-foreground">{ev.typeLabel}</span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">{ev.typeLabel}</Badge>
                        {canNavigate && (
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
