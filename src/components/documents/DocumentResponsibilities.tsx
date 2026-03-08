import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Clock, Users, CheckCircle2, XCircle, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  completed: "Completado",
  rejected: "Denegado",
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
  onWorkflowChange?: () => void;
}

export function DocumentResponsibilities({ documentId, documentCode, open, onOpenChange, onWorkflowChange }: DocumentResponsibilitiesProps) {
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedActionType, setSelectedActionType] = useState("revision");
  const [selectedDueDate, setSelectedDueDate] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isCompleting, setIsCompleting] = useState<string | null>(null);
  const [rejectingResp, setRejectingResp] = useState<Responsibility | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
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

  const handleMarkCompleted = async (resp: Responsibility) => {
    if (!user) return;
    if (resp.user_id !== user.id) {
      toast({ title: "No permitido", description: "Solo el responsable asignado puede marcar esta acción como completada.", variant: "destructive" });
      return;
    }
    setIsCompleting(resp.id);
    try {
      const { error } = await (supabase as any)
        .from("document_responsibilities")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", resp.id);
      if (error) throw error;

      toast({ title: "Revisión completada", description: "Has marcado tu revisión como completada." });
      await fetchResponsibilities();
      onWorkflowChange?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCompleting(null);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectingResp) return;
    setIsRejecting(true);
    try {
      // 1. Mark this responsibility as rejected
      const { error: rejectError } = await (supabase as any)
        .from("document_responsibilities")
        .update({ status: "rejected", completed_at: new Date().toISOString() })
        .eq("id", rejectingResp.id);
      if (rejectError) throw rejectError;

      // 2. Get current document status
      const { data: docData } = await supabase
        .from("documents")
        .select("status")
        .eq("id", documentId)
        .single();
      const oldStatus = (docData as any)?.status || "unknown";

      // 3. Set document back to draft
      const { error: docError } = await supabase
        .from("documents")
        .update({ status: "draft" as any })
        .eq("id", documentId);
      if (docError) throw docError;

      // 4. Record status change
      await (supabase as any).from("document_status_changes").insert({
        document_id: documentId,
        old_status: oldStatus,
        new_status: "draft",
        changed_by: user.id,
        comment: `Denegado por ${profile?.full_name || user.email}: ${rejectComment || "Sin comentario"}`,
      });

      // 5. Reset all responsibilities to pending (so they can be re-evaluated)
      await (supabase as any)
        .from("document_responsibilities")
        .update({ status: "pending", completed_at: null })
        .eq("document_id", documentId)
        .neq("id", rejectingResp.id); // Keep the rejected one as rejected

      toast({
        title: "Documento denegado",
        description: `El documento ${documentCode} ha sido devuelto a Borrador.`,
        variant: "destructive",
      });

      setRejectingResp(null);
      setRejectComment("");
      await fetchResponsibilities();
      onWorkflowChange?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsRejecting(false);
    }
  };

  const now = new Date();

  const reviewResps = responsibilities.filter(r => r.action_type === "revision");
  const firmaResps = responsibilities.filter(r => r.action_type === "firma");
  const aprobacionResps = responsibilities.filter(r => r.action_type === "aprobacion");
  const completedReviews = reviewResps.filter(r => r.status === "completed").length;
  const completedFirmas = firmaResps.filter(r => r.status === "completed").length;
  const hasRejection = responsibilities.some(r => r.status === "rejected");

  return (
    <>
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

          {/* Rejection banner */}
          {hasRejection && (
            <div className="border border-destructive/30 rounded-lg p-3 bg-destructive/5 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive font-medium">
                Este documento ha sido denegado y devuelto a Borrador. Revisa los comentarios y vuelve a enviar.
              </p>
            </div>
          )}

          {/* Workflow summary */}
          {responsibilities.length > 0 && (
            <div className="border border-border rounded-lg p-4 bg-secondary/5 space-y-2">
              <p className="text-sm font-medium text-foreground">Estado del flujo de aprobación</p>
              <div className="flex flex-wrap gap-3 text-xs">
                {reviewResps.length > 0 && (
                  <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md",
                    reviewResps.some(r => r.status === "rejected") ? "bg-destructive/10 text-destructive" :
                    completedReviews === reviewResps.length ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  )}>
                    {reviewResps.some(r => r.status === "rejected") ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Revisión: {completedReviews}/{reviewResps.length}
                    {reviewResps.some(r => r.status === "rejected") && " (Denegado)"}
                  </div>
                )}
                {firmaResps.length > 0 && (
                  <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md",
                    firmaResps.some(r => r.status === "rejected") ? "bg-destructive/10 text-destructive" :
                    completedFirmas === firmaResps.length ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                  )}>
                    {firmaResps.some(r => r.status === "rejected") ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Firma: {completedFirmas}/{firmaResps.length}
                    {firmaResps.some(r => r.status === "rejected") && " (Denegado)"}
                  </div>
                )}
                {aprobacionResps.length > 0 && (
                  <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md",
                    aprobacionResps.some(r => r.status === "rejected") ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"
                  )}>
                    {aprobacionResps.some(r => r.status === "rejected") ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Aprobación: {aprobacionResps.filter(r => r.status === "completed").length}/{aprobacionResps.length}
                    {aprobacionResps.some(r => r.status === "rejected") && " (Denegado)"}
                  </div>
                )}
              </div>
            </div>
          )}

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
                const isRejected = r.status === "rejected";
                const isCurrentUser = user?.id === r.user_id;
                const canComplete = isCurrentUser && r.status === "pending" && (r.action_type === "revision" || r.action_type === "firma");
                const canReject = isCurrentUser && r.status === "pending";

                return (
                  <div
                    key={r.id}
                    className={cn(
                      "border rounded-lg p-3 flex items-center justify-between gap-3",
                      isRejected ? "border-destructive/30 bg-destructive/5" :
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
                            {r.action_type === "revision" ? "Revisado" : "Completado"}
                          </Badge>
                        )}
                        {isRejected && (
                          <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive">
                            Denegado
                          </Badge>
                        )}
                        {!isCompleted && !isRejected && isCurrentUser && (
                          <Badge variant="outline" className="text-xs bg-accent/10 text-accent">
                            Tu tarea
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
                        {r.completed_at && isCompleted && (
                          <span className="text-xs text-success">
                            Completado: {format(new Date(r.completed_at), "dd/MM/yyyy HH:mm")}
                          </span>
                        )}
                        {r.completed_at && isRejected && (
                          <span className="text-xs text-destructive">
                            Denegado: {format(new Date(r.completed_at), "dd/MM/yyyy HH:mm")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {canComplete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-success border-success/30 hover:bg-success/10"
                          onClick={() => handleMarkCompleted(r)}
                          disabled={isCompleting === r.id}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          {isCompleting === r.id ? "..." : r.action_type === "firma" ? "Firmado" : "Revisado"}
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setRejectingResp(r)}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Denegar
                        </Button>
                      )}
                      {canEditContent && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
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

      {/* Reject confirmation dialog */}
      <AlertDialog open={!!rejectingResp} onOpenChange={(open) => { if (!open) { setRejectingResp(null); setRejectComment(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              Denegar documento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Al denegar, el documento <strong>{documentCode}</strong> volverá al estado <strong>Borrador</strong> y todas las revisiones/firmas/aprobaciones pendientes se reiniciarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Motivo de la denegación (opcional)</Label>
            <Textarea
              placeholder="Indica el motivo por el que deniegas este documento..."
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRejecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleReject(); }}
              disabled={isRejecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRejecting ? "Denegando..." : "Confirmar denegación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
