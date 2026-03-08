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

export interface ReclamacionFormData {
  title: string;
  description: string;
  source: string;
  source_code: string;
  response_deadline: Date | null;
  detail: string;
  investigation: string;
  resolution: string;
  conclusion: string;
  status: string;
  responsible_id: string;
}

interface UserRef { id: string; full_name: string | null; email: string | null; }
interface IncidenciaRef { id: string; title: string; }

interface AttachmentInfo {
  id?: string;
  file_name: string;
  isNew?: boolean;
  file?: File;
}

interface ReclamacionFormFieldsProps {
  form: ReclamacionFormData;
  onFormChange: (updater: (prev: ReclamacionFormData) => ReclamacionFormData) => void;
  users: UserRef[];
  isEditing?: boolean;
  attachments?: AttachmentInfo[];
  onAddFiles?: (files: FileList) => void;
  onRemoveAttachment?: (index: number) => void;
  incidencias?: IncidenciaRef[];
  selectedIncidenciaIds?: string[];
  onIncidenciaToggle?: (id: string) => void;
  participantIds?: string[];
  onParticipantToggle?: (userId: string) => void;
}

export function ReclamacionFormFields({
  form, onFormChange, users, isEditing,
  attachments = [], onAddFiles, onRemoveAttachment,
  incidencias = [], selectedIncidenciaIds = [], onIncidenciaToggle,
  participantIds = [], onParticipantToggle,
}: ReclamacionFormFieldsProps) {
  const showResolutionFields = isEditing;

  return (
    <div className="space-y-3">
      <div><Label>Título *</Label><Input value={form.title} onChange={(e) => onFormChange((p) => ({ ...p, title: e.target.value }))} /></div>
      <div><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => onFormChange((p) => ({ ...p, description: e.target.value }))} /></div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Fuente *</Label>
          <Select value={form.source} onValueChange={(v) => onFormChange((p) => ({ ...p, source: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="proveedor">Proveedor</SelectItem>
              <SelectItem value="cliente">Cliente</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Código {form.source === "proveedor" ? "proveedor" : form.source === "cliente" ? "cliente" : "referencia"}</Label>
          <Input value={form.source_code} onChange={(e) => onFormChange((p) => ({ ...p, source_code: e.target.value }))} placeholder="Código identificativo" />
        </div>
      </div>

      <div>
        <Label>Detalle de la reclamación</Label>
        <Textarea value={form.detail} onChange={(e) => onFormChange((p) => ({ ...p, detail: e.target.value }))} rows={3} placeholder="Detalle completo de la reclamación..." />
      </div>

      <div>
        <Label>Responsable *</Label>
        <Select value={form.responsible_id} onValueChange={(v) => onFormChange((p) => ({ ...p, responsible_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Sin responsable" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin responsable</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Empleados asignados */}
      {onParticipantToggle && users.length > 0 && (
        <div>
          <Label>Empleados asignados</Label>
          {participantIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {participantIds.map((uid) => {
                const u = users.find(usr => usr.id === uid);
                return (
                  <span key={uid} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    {u?.full_name ?? u?.email ?? uid}
                    <button type="button" onClick={() => onParticipantToggle(uid)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <Checkbox checked={participantIds.includes(u.id)} onCheckedChange={() => onParticipantToggle(u.id)} />
                <span className="truncate">{u.full_name ?? u.email ?? u.id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>Fecha límite de respuesta</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.response_deadline && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {form.response_deadline ? format(form.response_deadline, "dd/MM/yyyy") : "Sin fecha límite"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={form.response_deadline ?? undefined} onSelect={(d) => onFormChange((p) => ({ ...p, response_deadline: d ?? null }))} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>


      {showResolutionFields && (
        <>
          <div><Label>Investigación interna</Label><Textarea value={form.investigation} onChange={(e) => onFormChange((p) => ({ ...p, investigation: e.target.value }))} rows={3} placeholder="Resultados de la investigación interna..." /></div>
          <div><Label>Resolución</Label><Textarea value={form.resolution} onChange={(e) => onFormChange((p) => ({ ...p, resolution: e.target.value }))} rows={3} placeholder="Resolución aplicada..." /></div>
          <div><Label>Conclusión</Label><Textarea value={form.conclusion} onChange={(e) => onFormChange((p) => ({ ...p, conclusion: e.target.value }))} rows={3} placeholder="Conclusiones finales..." /></div>
        </>
      )}

      {/* Incidencias vinculadas */}
      {incidencias.length > 0 && onIncidenciaToggle && (
        <div>
          <Label>Incidencias vinculadas</Label>
          {selectedIncidenciaIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {selectedIncidenciaIds.map((id) => {
                const inc = incidencias.find((i) => i.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning rounded-full px-2 py-0.5">
                    {inc?.title || "Incidencia"}
                    <button type="button" onClick={() => onIncidenciaToggle(id)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
            {incidencias.map((inc) => (
              <label key={inc.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <Checkbox checked={selectedIncidenciaIds.includes(inc.id)} onCheckedChange={() => onIncidenciaToggle(inc.id)} />
                <span className="truncate">{inc.title}</span>
              </label>
            ))}
          </div>
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
