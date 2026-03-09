import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { QMS_ATTACHMENTS_MAX_FILES, QMS_ATTACHMENTS_MAX_FILE_SIZE_BYTES } from "@/constants/attachments";

type QmsAttachment = {
  id: string;
  object_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
};

export function QmsAttachmentsPanel({ entityType, entityId, editable = false }: { entityType: "non_conformity" | "action"; entityId: string | null; editable?: boolean }) {
  const [attachments, setAttachments] = useState<QmsAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    if (!entityId) return;
    const { data, error } = await (supabase as any)
      .from("qms_attachments")
      .select("id,object_path,file_name,mime_type,file_size")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (!error) setAttachments((data ?? []) as QmsAttachment[]);
  };

  useEffect(() => { void load(); }, [entityId, entityType]);

  const canUploadMore = useMemo(() => attachments.length < QMS_ATTACHMENTS_MAX_FILES, [attachments.length]);

  const uploadFiles = async (list: FileList | null) => {
    if (!entityId || !list) return;
    const files = Array.from(list);
    if (attachments.length + files.length > QMS_ATTACHMENTS_MAX_FILES) {
      toast({ title: "Límite excedido", description: `Máximo ${QMS_ATTACHMENTS_MAX_FILES} adjuntos por registro.`, variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Sesión inválida");
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle();
      const companyId = profile?.company_id;
      if (!companyId) throw new Error("No se pudo resolver la empresa del usuario");

      for (const file of files) {
        if (file.size > QMS_ATTACHMENTS_MAX_FILE_SIZE_BYTES) {
          toast({ title: "Archivo demasiado grande", description: `${file.name}: supera el límite permitido.`, variant: "destructive" });
          continue;
        }

        const encodedName = encodeURIComponent(file.name || "archivo").slice(0, 180);
        const path = `qms/${companyId}/${entityType}/${entityId}/${crypto.randomUUID()}_${encodedName}`;
        const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
        if (uploadError) {
          toast({ title: "Error subiendo archivo", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
          continue;
        }

        const { error: registerError } = await (supabase as any).rpc("register_qms_attachment", {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_bucket_id: "documents",
          p_object_path: path,
          p_file_name: file.name,
        });

        if (registerError) {
          await supabase.storage.from("documents").remove([path]);
          toast({ title: "Error registrando adjunto", description: registerError.message, variant: "destructive" });
        }
      }

      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "No se pudieron subir adjuntos.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const downloadAttachment = async (att: QmsAttachment) => {
    const { data, error } = await supabase.storage.from("documents").download(att.object_path);
    if (error || !data) {
      toast({ title: "Error", description: "No se pudo descargar el archivo.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.file_name ?? att.object_path.split("/").pop() ?? "archivo";
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewAttachment = async (att: QmsAttachment) => {
    const mime = att.mime_type ?? "";
    const canPreview = mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/");
    if (!canPreview) {
      toast({ title: "Previsualización no disponible", description: "Descarga el archivo para abrirlo localmente." });
      return;
    }
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(att.object_path, 120);
    if (error || !data?.signedUrl) {
      toast({ title: "Error", description: "No se pudo generar vista previa.", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const deleteAttachment = async (att: QmsAttachment) => {
    const { error } = await (supabase as any).rpc("delete_qms_attachment", { p_attachment_id: att.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Adjunto eliminado" });
    await load();
  };

  return (
    <div className="space-y-2">
      <Label>Adjuntos</Label>
      {editable && entityId && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!canUploadMore || busy} onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.onchange = () => void uploadFiles(input.files);
            input.click();
          }}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Paperclip className="h-4 w-4 mr-1" />}Adjuntar archivos
          </Button>
          <p className="text-xs text-muted-foreground">Máx. {QMS_ATTACHMENTS_MAX_FILES} archivos / {(QMS_ATTACHMENTS_MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB c/u.</p>
        </div>
      )}
      {attachments.length === 0 ? <p className="text-xs text-muted-foreground">Sin adjuntos.</p> : (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between border rounded p-2">
              <button onClick={() => downloadAttachment(att)} className="text-sm hover:underline inline-flex items-center gap-1 text-primary">
                <FileText className="h-4 w-4" />{att.file_name ?? att.object_path.split("/").pop()}
              </button>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => previewAttachment(att)} title="Previsualizar">
                  <Eye className="h-4 w-4" />
                </Button>
                {editable && <Button type="button" variant="ghost" size="icon" onClick={() => deleteAttachment(att)} title="Eliminar" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
