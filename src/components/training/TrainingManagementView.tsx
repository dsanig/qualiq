import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  GraduationCap,
  Plus,
  Loader2,
  FileText,
  Users,
  PenLine,
  Trash2,
  CheckCircle,
  Clock,
  CalendarIcon,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TrainingRecord {
  id: string;
  title: string;
  description: string | null;
  contents: string | null;
  status: string;
  deadline: string | null;
  created_by: string;
  created_at: string;
}

interface CompanyUser {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface CompanyDocument {
  id: string;
  code: string;
  title: string;
}

interface Participant {
  user_id: string;
  role: "trainer" | "trainee";
}

interface Signature {
  user_id: string;
  role: string;
  signer_name: string;
  signed_at: string;
}

interface Attachment {
  id: string;
  file_name: string | null;
  object_path: string;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function TrainingManagementView() {
  const { user, profile } = useAuth();

  /* List state */
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /* Form dialog */
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contents, setContents] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([]);
  const [selectedTrainees, setSelectedTrainees] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [formStatus, setFormStatus] = useState<string>("pendiente");
  const [formDeadline, setFormDeadline] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /* Detail dialog */
  const [detailRecord, setDetailRecord] = useState<TrainingRecord | null>(null);
  const [detailParticipants, setDetailParticipants] = useState<Participant[]>([]);
  const [detailSignatures, setDetailSignatures] = useState<Signature[]>([]);
  const [detailDocIds, setDetailDocIds] = useState<string[]>([]);
  const [detailAttachments, setDetailAttachments] = useState<Attachment[]>([]);
  const [signName, setSignName] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  /* Lookup data */
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [companyDocs, setCompanyDocs] = useState<CompanyDocument[]>([]);

  /* ---------------------------------------------------------------- */
  /* Data fetching                                                     */
  /* ---------------------------------------------------------------- */

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    const { data } = await (supabase as any)
      .from("training_records")
      .select("id, title, description, contents, status, deadline, created_by, created_at")
      .order("created_at", { ascending: false });
    setRecords((data as TrainingRecord[]) ?? []);
    setIsLoading(false);
  }, []);

  const fetchLookups = useCallback(async () => {
    if (!profile?.company_id) return;
    const [usersRes, docsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("company_id", profile.company_id),
      supabase
        .from("documents")
        .select("id, code, title")
        .eq("company_id", profile.company_id)
        .order("code"),
    ]);
    setCompanyUsers((usersRes.data as CompanyUser[]) ?? []);
    setCompanyDocs((docsRes.data as CompanyDocument[]) ?? []);
  }, [profile?.company_id]);

  useEffect(() => {
    fetchRecords();
    fetchLookups();
  }, [fetchRecords, fetchLookups]);

  /* ---------------------------------------------------------------- */
  /* Create / Edit                                                     */
  /* ---------------------------------------------------------------- */

  const openNewForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setContents("");
    setSelectedDocIds([]);
    setSelectedTrainers([]);
    setSelectedTrainees([]);
    setPendingFiles([]);
    setFormStatus("pendiente");
    setFormDeadline(null);
    setFormOpen(true);
  };

  const openEditForm = async (rec: TrainingRecord) => {
    setEditingId(rec.id);
    setTitle(rec.title);
    setDescription(rec.description ?? "");
    setContents(rec.contents ?? "");
    setFormStatus(rec.status || "pendiente");
    setFormDeadline(rec.deadline ? new Date(rec.deadline) : null);

    // Load linked docs
    const { data: linkedDocs } = await (supabase as any)
      .from("training_record_documents")
      .select("document_id")
      .eq("training_record_id", rec.id);
    setSelectedDocIds((linkedDocs ?? []).map((d: any) => d.document_id));

    // Load participants
    const { data: parts } = await (supabase as any)
      .from("training_participants")
      .select("user_id, role")
      .eq("training_record_id", rec.id);
    setSelectedTrainers((parts ?? []).filter((p: any) => p.role === "trainer").map((p: any) => p.user_id));
    setSelectedTrainees((parts ?? []).filter((p: any) => p.role === "trainee").map((p: any) => p.user_id));
    setPendingFiles([]);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !profile?.company_id || !user) return;
    setIsSaving(true);

    try {
      let recordId = editingId;

      if (editingId) {
        await (supabase as any)
          .from("training_records")
          .update({ title, description, contents, status: formStatus, deadline: formDeadline ? formDeadline.toISOString().split("T")[0] : null, updated_at: new Date().toISOString() })
          .eq("id", editingId);
      } else {
        const { data, error } = await (supabase as any)
          .from("training_records")
          .insert({ title, description, contents, status: formStatus, deadline: formDeadline ? formDeadline.toISOString().split("T")[0] : null, company_id: profile.company_id, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        recordId = data.id;
      }

      // Sync documents
      await (supabase as any).from("training_record_documents").delete().eq("training_record_id", recordId);
      if (selectedDocIds.length > 0) {
        await (supabase as any).from("training_record_documents").insert(
          selectedDocIds.map((docId) => ({ training_record_id: recordId, document_id: docId }))
        );
      }

      // Sync participants
      await (supabase as any).from("training_participants").delete().eq("training_record_id", recordId);
      const participantRows = [
        ...selectedTrainers.map((uid) => ({ training_record_id: recordId, user_id: uid, role: "trainer" })),
        ...selectedTrainees.map((uid) => ({ training_record_id: recordId, user_id: uid, role: "trainee" })),
      ];
      if (participantRows.length > 0) {
        await (supabase as any).from("training_participants").insert(participantRows);
      }
      // Upload pending files
      if (pendingFiles.length > 0 && recordId) {
        for (const file of pendingFiles) {
          const path = `training/${recordId}/${Date.now()}_${file.name}`;
          const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
          if (uploadError) {
            console.error(uploadError);
            continue;
          }
          await (supabase as any).from("training_record_attachments").insert({
            training_record_id: recordId,
            object_path: path,
            file_name: file.name,
            file_type: file.type,
            created_by: user.id,
          });
        }
      }

      toast({ title: editingId ? "Formación actualizada" : "Formación creada" });
      setFormOpen(false);
      fetchRecords();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "No se pudo guardar la formación", variant: "destructive" });
    }
    setIsSaving(false);
  };

  /* ---------------------------------------------------------------- */
  /* Delete                                                            */
  /* ---------------------------------------------------------------- */

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from("training_records").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    } else {
      toast({ title: "Formación eliminada" });
      if (detailRecord?.id === id) setDetailRecord(null);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    }
  };

  /* ---------------------------------------------------------------- */
  /* Detail / Signatures                                               */
  /* ---------------------------------------------------------------- */

  const openDetail = async (rec: TrainingRecord) => {
    setDetailRecord(rec);
    setSignName("");

    const [partsRes, sigsRes, docsRes, attachRes] = await Promise.all([
      (supabase as any).from("training_participants").select("user_id, role").eq("training_record_id", rec.id),
      (supabase as any).from("training_signatures").select("user_id, role, signer_name, signed_at").eq("training_record_id", rec.id),
      (supabase as any).from("training_record_documents").select("document_id").eq("training_record_id", rec.id),
      (supabase as any).from("training_record_attachments").select("id, file_name, object_path").eq("training_record_id", rec.id),
    ]);

    setDetailParticipants((partsRes.data ?? []) as Participant[]);
    setDetailSignatures((sigsRes.data ?? []) as Signature[]);
    setDetailDocIds((docsRes.data ?? []).map((d: any) => d.document_id));
    setDetailAttachments((attachRes.data ?? []) as Attachment[]);
  };

  const handleSign = async (role: "trainer" | "trainee") => {
    if (!signName.trim() || !user || !detailRecord) return;
    setIsSigning(true);
    try {
      const { error } = await (supabase as any).from("training_signatures").insert({
        training_record_id: detailRecord.id,
        user_id: user.id,
        signer_name: signName.trim(),
        role,
      });
      if (error) throw error;
      toast({ title: "Firmado correctamente" });
      setSignName("");
      openDetail(detailRecord);
    } catch (err: any) {
      const msg = err?.message?.includes("duplicate") ? "Ya has firmado este registro" : "No se pudo firmar";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setIsSigning(false);
  };

  /* ---------------------------------------------------------------- */
  /* File upload                                                       */
  /* ---------------------------------------------------------------- */

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !detailRecord || !user) return;
    setIsUploading(true);

    for (const file of Array.from(files)) {
      const path = `training/${detailRecord.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
      if (uploadError) {
        console.error(uploadError);
        toast({ title: "Error subiendo archivo", description: file.name, variant: "destructive" });
        continue;
      }
      await (supabase as any).from("training_record_attachments").insert({
        training_record_id: detailRecord.id,
        object_path: path,
        file_name: file.name,
        file_type: file.type,
        created_by: user.id,
      });
    }

    toast({ title: "Archivos subidos" });
    openDetail(detailRecord);
    setIsUploading(false);
  };

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  const getUserName = (uid: string) => {
    const u = companyUsers.find((cu) => cu.user_id === uid);
    return u?.full_name || u?.email || uid.slice(0, 8);
  };

  const getDocLabel = (docId: string) => {
    const d = companyDocs.find((cd) => cd.id === docId);
    return d ? `${d.code} - ${d.title}` : docId.slice(0, 8);
  };

  const toggleInList = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setList((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const userHasSigned = (role: "trainer" | "trainee") =>
    detailSignatures.some((s) => s.user_id === user?.id && s.role === role);

  const isParticipant = (role: "trainer" | "trainee") =>
    detailParticipants.some((p) => p.user_id === user?.id && p.role === role);

  const statusLabel = (s: string) => {
    if (s === "completa") return "Completa";
    if (s === "en_proceso") return "En proceso";
    return "Pendiente";
  };

  const statusVariant = (s: string, deadline: string | null): "default" | "secondary" | "destructive" | "outline" => {
    if (s === "completa") return "default";
    if (deadline && new Date(deadline) < new Date()) return "destructive";
    if (s === "en_proceso") return "secondary";
    return "outline";
  };

  /* ---------------------------------------------------------------- */
  /* Render: Detail dialog                                             */
  /* ---------------------------------------------------------------- */

  const renderDetailDialog = () => {
    if (!detailRecord) return null;

    const trainers = detailParticipants.filter((p) => p.role === "trainer");
    const trainees = detailParticipants.filter((p) => p.role === "trainee");
    const trainerSigs = detailSignatures.filter((s) => s.role === "trainer");
    const traineeSigs = detailSignatures.filter((s) => s.role === "trainee");
    const allSigned = trainers.length > 0 && trainees.length > 0 &&
      trainers.every((t) => trainerSigs.some((s) => s.user_id === t.user_id)) &&
      trainees.every((t) => traineeSigs.some((s) => s.user_id === t.user_id));

    const canSignAsTrainer = isParticipant("trainer") && !userHasSigned("trainer");
    const canSignAsTrainee = isParticipant("trainee") && !userHasSigned("trainee");
    const canSign = canSignAsTrainer || canSignAsTrainee;

    return (
      <Dialog open={!!detailRecord} onOpenChange={() => setDetailRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5" />
              {detailRecord.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Status */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant={statusVariant(detailRecord.status, detailRecord.deadline)}>
                {statusLabel(detailRecord.status)}
                {detailRecord.status !== "completa" && detailRecord.deadline && new Date(detailRecord.deadline) < new Date() && " — Vencida"}
              </Badge>
              {detailRecord.deadline && (
                <Badge variant="outline" className="text-xs gap-1">
                  <CalendarIcon className="w-3 h-3" />
                  Límite: {format(new Date(detailRecord.deadline), "dd/MM/yyyy")}
                </Badge>
              )}
              {allSigned && (
                <Badge variant="default" className="text-xs gap-1">
                  <CheckCircle className="w-3 h-3" /> Todas las firmas completadas
                </Badge>
              )}
            </div>

            {/* Description */}
            {detailRecord.description && (
              <div>
                <Label className="text-xs text-muted-foreground">Descripción</Label>
                <p className="text-sm mt-1">{detailRecord.description}</p>
              </div>
            )}

            {/* Contents */}
            {detailRecord.contents && (
              <div>
                <Label className="text-xs text-muted-foreground">Contenidos</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap">{detailRecord.contents}</p>
              </div>
            )}

            {/* Linked documents */}
            {detailDocIds.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Documentos asociados</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detailDocIds.map((docId) => (
                    <Badge key={docId} variant="outline" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      {getDocLabel(docId)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            <div>
              <Label className="text-xs text-muted-foreground">Archivos adjuntos</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {detailAttachments.map((att) => (
                  <Badge key={att.id} variant="outline" className="text-xs">
                    <Paperclip className="w-3 h-3 mr-1" />
                    {att.file_name || "Archivo"}
                  </Badge>
                ))}
                <label className="cursor-pointer">
                  <Badge variant="secondary" className="text-xs cursor-pointer">
                    {isUploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                    Subir archivo
                  </Badge>
                  <input type="file" className="hidden" multiple onChange={handleFileUpload} disabled={isUploading} />
                </label>
              </div>
            </div>

            {/* Participants & signatures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Trainers */}
              <div className="border rounded-lg p-3">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <Users className="w-3 h-3" /> Formadores
                </Label>
                <div className="space-y-1.5">
                  {trainers.map((t) => {
                    const sig = trainerSigs.find((s) => s.user_id === t.user_id);
                    return (
                      <div key={t.user_id} className="flex items-center justify-between text-sm">
                        <span>{getUserName(t.user_id)}</span>
                        {sig ? (
                          <Badge variant="default" className="text-xs gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Firmado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Clock className="w-3 h-3" />
                            Pendiente
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {trainers.length === 0 && <p className="text-xs text-muted-foreground">Sin formadores asignados</p>}
                </div>
              </div>

              {/* Trainees */}
              <div className="border rounded-lg p-3">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <GraduationCap className="w-3 h-3" /> Receptores
                </Label>
                <div className="space-y-1.5">
                  {trainees.map((t) => {
                    const sig = traineeSigs.find((s) => s.user_id === t.user_id);
                    return (
                      <div key={t.user_id} className="flex items-center justify-between text-sm">
                        <span>{getUserName(t.user_id)}</span>
                        {sig ? (
                          <Badge variant="default" className="text-xs gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Firmado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Clock className="w-3 h-3" />
                            Pendiente
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {trainees.length === 0 && <p className="text-xs text-muted-foreground">Sin receptores asignados</p>}
                </div>
              </div>
            </div>

            {/* Sign area */}
            {canSign && (
              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Firmar este registro</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Introduce tu nombre completo para firmar"
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    className="flex-1"
                  />
                  {canSignAsTrainer && (
                    <Button size="sm" onClick={() => handleSign("trainer")} disabled={!signName.trim() || isSigning}>
                      {isSigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4 mr-1" />}
                      Firmar como Formador
                    </Button>
                  )}
                  {canSignAsTrainee && (
                    <Button size="sm" onClick={() => handleSign("trainee")} disabled={!signName.trim() || isSigning}>
                      {isSigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4 mr-1" />}
                      Firmar como Receptor
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  /* ---------------------------------------------------------------- */
  /* Render: Form dialog                                               */
  /* ---------------------------------------------------------------- */

  const renderFormDialog = () => (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Editar Formación" : "Nueva Formación"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la formación" />
          </div>

          <div>
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción general" rows={2} />
          </div>

          <div>
            <Label>Contenidos</Label>
            <Textarea value={contents} onChange={(e) => setContents(e.target.value)} placeholder="Contenidos de la formación..." rows={4} />
          </div>

          {/* Status + Deadline */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Estado</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="en_proceso">En proceso</SelectItem>
                  <SelectItem value="completa">Completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha límite</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDeadline && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formDeadline ? format(formDeadline, "dd/MM/yyyy") : "Sin fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formDeadline ?? undefined} onSelect={(d) => setFormDeadline(d ?? null)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Documentos del sistema</Label>
            <div className="border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
              {companyDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No hay documentos disponibles</p>
              ) : (
                companyDocs.map((doc) => (
                  <label key={doc.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedDocIds.includes(doc.id)}
                      onCheckedChange={() => toggleInList(selectedDocIds, setSelectedDocIds, doc.id)}
                    />
                    <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{doc.code} - {doc.title}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Trainer selection */}
          <div>
            <Label className="mb-2 block">Responsables de impartir (Formadores)</Label>
            <div className="border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
              {companyUsers.map((u) => (
                <label key={u.user_id} className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedTrainers.includes(u.user_id)}
                    onCheckedChange={() => toggleInList(selectedTrainers, setSelectedTrainers, u.user_id)}
                  />
                  <span className="truncate">{u.full_name || u.email}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Trainee selection */}
          <div>
            <Label className="mb-2 block">Responsables de recibir (Receptores)</Label>
            <div className="border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
              {companyUsers.map((u) => (
                <label key={u.user_id} className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedTrainees.includes(u.user_id)}
                    onCheckedChange={() => toggleInList(selectedTrainees, setSelectedTrainees, u.user_id)}
                  />
                  <span className="truncate">{u.full_name || u.email}</span>
                </label>
              ))}
            </div>
          </div>

          {/* File attachments */}
          <div>
            <Label className="mb-2 block">Archivos adjuntos</Label>
            <div className="space-y-2">
              {pendingFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm border rounded px-2 py-1">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{file.name}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.multiple = true;
                input.onchange = () => { if (input.files?.length) setPendingFiles((prev) => [...prev, ...Array.from(input.files!)]); };
                input.click();
              }}>
                <Paperclip className="h-4 w-4 mr-1" /> Adjuntar archivo
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {editingId ? "Guardar cambios" : "Crear formación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  /* ---------------------------------------------------------------- */
  /* Render: Main                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Gestión de Formaciones</h2>
          <p className="text-sm text-muted-foreground">Registra, gestiona y firma formaciones impartidas</p>
        </div>
        <Button onClick={openNewForm}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Formación
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GraduationCap className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">Sin formaciones registradas</p>
            <p className="text-sm text-muted-foreground mt-1">Crea el primer registro de formación</p>
            <Button className="mt-4" onClick={openNewForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Formación
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {records.map((rec) => (
            <Card key={rec.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(rec)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base line-clamp-2">{rec.title}</CardTitle>
                  <Badge variant={statusVariant(rec.status, rec.deadline)} className="ml-2 flex-shrink-0">
                    {statusLabel(rec.status)}
                    {rec.status !== "completa" && rec.deadline && new Date(rec.deadline) < new Date() ? " ⚠" : ""}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">{rec.description || "Sin descripción"}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      {new Date(rec.created_at).toLocaleDateString("es-ES")}
                    </span>
                    {rec.deadline && (
                      <span className={cn("text-xs flex items-center gap-1", rec.status !== "completa" && new Date(rec.deadline) < new Date() ? "text-destructive font-medium" : "text-muted-foreground")}>
                        <CalendarIcon className="w-3 h-3" />
                        Límite: {new Date(rec.deadline).toLocaleDateString("es-ES")}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditForm(rec); }}>
                      <PenLine className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar esta formación?</AlertDialogTitle>
                          <AlertDialogDescription>Se eliminarán todos los datos asociados. Esta acción no se puede deshacer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(rec.id)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {renderFormDialog()}
      {renderDetailDialog()}
    </div>
  );
}
