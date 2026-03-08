import { useState } from "react";
import { Copy, Check, Link2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface ShareDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentCode: string;
  documentStatus: string;
}

const DURATION_OPTIONS = [
  { value: "1h", label: "1 hora" },
  { value: "24h", label: "24 horas" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
];

function getExpiresAt(duration: string): string {
  const now = new Date();
  switch (duration) {
    case "1h": now.setHours(now.getHours() + 1); break;
    case "24h": now.setHours(now.getHours() + 24); break;
    case "7d": now.setDate(now.getDate() + 7); break;
    case "30d": now.setDate(now.getDate() + 30); break;
    default: now.setHours(now.getHours() + 24);
  }
  return now.toISOString();
}

export function ShareDocumentDialog({
  open,
  onOpenChange,
  documentId,
  documentCode,
  documentStatus,
}: ShareDocumentDialogProps) {
  const [duration, setDuration] = useState("24h");
  const [generatedLink, setGeneratedLink] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const isApproved = documentStatus === "approved";

  const handleGenerate = async () => {
    if (!user || !isApproved) return;
    setIsGenerating(true);
    try {
      const expiresAt = getExpiresAt(duration);

      const { data, error } = await (supabase as any)
        .from("document_share_links")
        .insert({
          document_id: documentId,
          created_by: user.id,
          expires_at: expiresAt,
        })
        .select("token")
        .single();

      if (error) throw error;

      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-document`;
      const link = `${baseUrl}?token=${data.token}`;
      setGeneratedLink(link);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      toast({ title: "Enlace copiado", description: "El enlace se ha copiado al portapapeles." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Error", description: "No se pudo copiar el enlace.", variant: "destructive" });
    }
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setGeneratedLink("");
      setCopied(false);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-accent" />
            Compartir documento
          </DialogTitle>
          <DialogDescription>
            Genera un enlace de descarga para <strong>{documentCode}</strong>.
          </DialogDescription>
        </DialogHeader>

        {!isApproved ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Solo se pueden compartir documentos en estado <strong>Aprobado</strong>.
          </div>
        ) : (
          <div className="space-y-4">
            {!generatedLink ? (
              <>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Duración del enlace
                  </Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
                  {isGenerating ? "Generando..." : "Generar enlace"}
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <Label>Enlace de descarga</Label>
                <div className="flex gap-2">
                  <Input value={generatedLink} readOnly className="text-xs" />
                  <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Este enlace expira en {DURATION_OPTIONS.find((o) => o.value === duration)?.label}. Cualquier persona con el enlace podrá descargar el documento.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
