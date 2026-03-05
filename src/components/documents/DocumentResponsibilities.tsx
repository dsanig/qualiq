import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const actionTypeLabels: Record<string, string> = {
  firma: "Firma",
  aprobacion: "Aprobación",
  revision: "Revisión",
};

const actionTypeColors: Record<string, string> = {
  firma: "bg-primary/10 text-primary",
  aprobacion: "bg-success/10 text-success",
  revision: "bg-warning/10 text-warning",
};

interface Responsibility {
  id: string;
  user_id: string;
  action_type: string;
  due_date: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  userName?: string;
  userEmail?: string;
}

interface CompanyUser {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface DocumentResponsibilitiesProps {
  documentId: string;
  documentCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentResponsibilities({ documentId, documentCode, open, onOpenChange }: DocumentResponsibilitiesProps) {
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedActionType, setSelectedActionType] = useState("revision");
  const [selectedDueDate, setSelectedDueDate] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const { user, profile } = useAuth();
  const { canEditContent } = usePermissions();
  const { toast } = useToast();

  const fetchResponsibilities = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("document_responsibilities")
      .select("id, user_id, action_type, due_date, status, completed_at, created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const userIds = [...new Set((data as Responsibility[]).map(r => r.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };
      const nameMap = new Map((profiles || []).map(p => [p.user_id, { name: p.full_name || p.email, email: p.email }]));
      setResponsibilities((data as Responsibility[]).map(r => ({
        ...r,
        userName: nameMap.get(r.user_id)?.name || r.user_id,
        userEmail: nameMap.get(r.user_id)?.email || "",
      })));
    }
    setIsLoading(false);
  }, [documentId]);

  const fetchCompanyUsers = useCallback(async () => {
    if (!profile?.company_id) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("company_id", profile.company_id);
    setCompanyUsers(data || []);
  }, [profile?.company_id]);

  useEffect(() => {
    if (open) {
      fetchResponsibilities();
      fetchCompanyUsers();
    }
  }, [open, fetchResponsibilities, fetchCompanyUsers]);

  const handleAdd = async () => {
    if (!selectedUserId || !selectedDueDate || !user) {
      toast({ title: "Campos requeridos", description: "Selecciona usuario, acción y fecha límite.", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      const { error } = await (supabase as any).from("document_responsibilities").insert({
        document_id: documentId,
        user_id: selectedUserId,
        action_type: selectedActionType,
        due_date: selectedDueDate,
        created_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Responsable añadido" });
      setSelectedUserId("");
      setSelectedDueDate("");
      fetchResponsibilities();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await (supabase as any).from("document_responsibilities").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Responsable eliminado" });
      fetchResponsibilities();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const now = new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Responsables del documento
          </DialogTitle>
          <DialogDescription>
            Asigna responsables con acciones y fechas límite para {documentCode}.
          </DialogDescription>
        </DialogHeader>

        {/* Add new responsibility */}
        {canEditContent && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-secondary/10">
            <p className="text-sm font-medium text-foreground">Añadir responsable</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Usuario</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {companyUsers.map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.full_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Acción</Label>
                <Select value={selectedActionType} onValueChange={setSelectedActionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="firma">Firma</SelectItem>
                    <SelectItem value="aprobacion">Aprobación</SelectItem>
                    <SelectItem value="revision">Revisión</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha límite</Label>
                <Input type="date" value={selectedDueDate} onChange={e => setSelectedDueDate(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={isAdding || !selectedUserId || !selectedDueDate}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              {isAdding ? "Añadiendo..." : "Añadir"}
            </Button>
          </div>
        )}

        {/* Responsibilities list */}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="text-center text-muted-foreground text-sm py-4">Cargando...</p>
          ) : responsibilities.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-4">No hay responsables asignados.</p>
          ) : (
            responsibilities.map(r => {
              const isOverdue = r.status === "pending" && new Date(r.due_date) < now;
              const isCompleted = r.status === "completed";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "border rounded-lg p-3 flex items-center justify-between gap-3",
                    isCompleted ? "border-success/30 bg-success/5" :
                    isOverdue ? "border-destructive/30 bg-destructive/5" :
                    "border-border"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{r.userName}</p>
                      <Badge variant="outline" className={cn("text-xs", actionTypeColors[r.action_type])}>
                        {actionTypeLabels[r.action_type] || r.action_type}
                      </Badge>
                      {isCompleted && (
                        <Badge variant="outline" className="text-xs bg-success/10 text-success">
                          Completado
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-xs flex items-center gap-1",
                        isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                      )}>
                        <Clock className="w-3 h-3" />
                        Límite: {format(new Date(r.due_date), "dd/MM/yyyy")}
                      </span>
                      {r.completed_at && (
                        <span className="text-xs text-success">
                          Completado: {format(new Date(r.completed_at), "dd/MM/yyyy HH:mm")}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEditContent && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
