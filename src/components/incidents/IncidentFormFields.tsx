import { format } from "date-fns";
import { CalendarIcon, Paperclip, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type IncidentType = "incidencia" | "desviacion" | "no_conformidad" | "otra";

interface AuditRef { id: string; title: string; }
interface UserRef { id: string; full_name: string | null; email: string | null; }
export interface CapaPlanRef { id: string; title: string | null; auditTitle: string | null; }

export interface IncidentFormData {
  title: string;
  description: string;
  incidencia_type: IncidentType;
  audit_id: string;
  responsible_id: string;
  status: string;
  deadline: Date | null;
  resolution_notes: string;
}

interface AttachmentInfo {
  id?: string;
  file_name: string;
  isNew?: boolean;
  file?: File;
}

interface IncidentFormFieldsProps {
  form: IncidentFormData;
  onFormChange: (updater: (prev: IncidentFormData) => IncidentFormData) => void;
  audits: AuditRef[];
  users: UserRef[];
  isEditing?: boolean;
  attachments?: AttachmentInfo[];
  onAddFiles?: (files: FileList) => void;
  onRemoveAttachment?: (index: number) => void;
  capaPlans?: CapaPlanRef[];
  selectedCapaPlanIds?: string[];
  onCapaPlanToggle?: (planId: string) => void;
}

export function IncidentFormFields({
  form, onFormChange, audits, users, isEditing,
  attachments = [], onAddFiles, onRemoveAttachment,
  capaPlans = [], selectedCapaPlanIds = [], onCapaPlanToggle,
}: IncidentFormFieldsProps) {
  const showResolutionNotes = isEditing && form.status === "closed";

  return (
    <div className="space-y-3">
      <div><Label>Título</Label><Input value={form.title} onChange={(e) => onFormChange((p) => ({ ...p, title: e.target.value }))} /></div>
      <div><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => onFormChange((p) => ({ ...p, description: e.target.value }))} /></div>
      <div>
        <Label>Tipo</Label>
        <Select value={form.incidencia_type} onValueChange={(v: IncidentType) => onFormChange((p) => ({ ...p, incidencia_type: v }))}>
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
        <Select value={form.audit_id} onValueChange={(v) => onFormChange((p) => ({ ...p, audit_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Sin auditoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin auditoría</SelectItem>
            {(audits ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* CAPA Plans multi-select */}
      {capaPlans.length > 0 && onCapaPlanToggle && (
        <div>
          <Label>Planes CAPA asociados</Label>
          {selectedCapaPlanIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {selectedCapaPlanIds.map((id) => {
                const plan = capaPlans.find((p) => p.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    {plan?.title || "Plan CAPA"}
                    <button type="button" onClick={() => onCapaPlanToggle(id)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
            {capaPlans.map((plan) => (
              <label key={plan.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <Checkbox
                  checked={selectedCapaPlanIds.includes(plan.id)}
                  onCheckedChange={() => onCapaPlanToggle(plan.id)}
                />
                <span className="truncate">
                  {plan.title || "Plan CAPA"}{plan.auditTitle ? ` — ${plan.auditTitle}` : ""}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>Responsable</Label>
        <Select value={form.responsible_id} onValueChange={(v) => onFormChange((p) => ({ ...p, responsible_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Sin responsable" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin responsable</SelectItem>
            {(users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Fecha límite</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.deadline && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {form.deadline ? format(form.deadline, "dd/MM/yyyy") : "Sin fecha límite"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={form.deadline ?? undefined}
              onSelect={(d) => onFormChange((p) => ({ ...p, deadline: d ?? null }))}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <Label>Estado</Label>
        <Select value={form.status} onValueChange={(v) => onFormChange((p) => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abierto</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="closed">Cerrado</SelectItem>
            <SelectItem value="overdue">Vencido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showResolutionNotes && (
        <div>
          <Label>Observaciones / Solución</Label>
          <Textarea
            value={form.resolution_notes}
            onChange={(e) => onFormChange((p) => ({ ...p, resolution_notes: e.target.value }))}
            placeholder="Describe la solución aplicada, observaciones, causas raíz, etc."
            rows={4}
          />
        </div>
      )}

      {/* Attachments */}
      <div>
        <Label>Documentos adjuntos</Label>
        <div className="mt-1 space-y-2">
          {attachments.map((att, idx) => (
            <div key={att.id ?? idx} className="flex items-center gap-2 text-sm border rounded px-2 py-1">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{att.file_name}</span>
              {onRemoveAttachment && (
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveAttachment(idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          {onAddFiles && (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.onchange = () => { if (input.files?.length) onAddFiles(input.files); };
              input.click();
            }}>
              <Paperclip className="h-4 w-4 mr-1" />Adjuntar archivo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
