import { useState, useEffect } from "react";
import { History, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface StatusOption {
  value: string;
  label: string;
}

interface StatusChange {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  changed_at: string;
  comment: string | null;
}

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: string;
  statusOptions: StatusOption[];
  entityId: string;
  /** Table name: "incidencias" | "reclamaciones" */
  entityType: "incidencias" | "reclamaciones";
  /** History table name */
  historyTable: string;
  /** Foreign key column in history table */
  foreignKey: string;
  onStatusChanged: () => void;
  getUserName: (userId: string | null | undefined) => string | null;
}

export function StatusChangeDialog({
  open, onOpenChange, currentStatus, statusOptions, entityId,
  entityType, historyTable, foreignKey, onStatusChanged, getUserName,
}: StatusChangeDialogProps) {
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<StatusChange[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewStatus(currentStatus);
    setComment("");
    loadHistory();
  }, [open, entityId]);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    const { data } = await (supabase as any)
      .from(historyTable)
      .select("*")
      .eq(foreignKey, entityId)
      .order("changed_at", { ascending: false });
    setHistory(Array.isArray(data) ? data : []);
    setIsLoadingHistory(false);
  };

  const handleSave = async () => {
    if (newStatus === currentStatus) return;
    setIsSaving(true);

    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setIsSaving(false); return; }

    // Insert status change record
    await (supabase as any).from(historyTable).insert({
      [foreignKey]: entityId,
      old_status: currentStatus,
      new_status: newStatus,
      changed_by: userId,
      comment: comment || null,
    });

    // Update entity status
    await (supabase as any).from(entityType).update({ status: newStatus }).eq("id", entityId);

    setIsSaving(false);
    onOpenChange(false);
    onStatusChanged();
  };

  const getStatusLabel = (status: string | null) => {
    if (!status) return "—";
    return statusOptions.find((o) => o.value === status)?.label ?? status;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar Estado</DialogTitle>
          <DialogDescription>
            Estado actual: <Badge variant="outline">{getStatusLabel(currentStatus)}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nuevo estado</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observaciones (opcional)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Motivo del cambio de estado..."
              rows={3}
            />
          </div>

          {/* Status History */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Historial de estados</Label>
            </div>
            {isLoadingHistory ? (
              <p className="text-sm text-muted-foreground">Cargando historial...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Sin cambios de estado registrados</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-2">
                {history.map((entry) => (
                  <div key={entry.id} className="text-xs border-b last:border-b-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{getStatusLabel(entry.old_status)}</Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="secondary" className="text-[10px]">{getStatusLabel(entry.new_status)}</Badge>
                      <span className="text-muted-foreground ml-auto">
                        {new Date(entry.changed_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">
                      Por: {getUserName(entry.changed_by) ?? "Desconocido"}
                      {entry.comment && ` — ${entry.comment}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || newStatus === currentStatus}>
            {isSaving ? "Guardando..." : "Confirmar cambio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
