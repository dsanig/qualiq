import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";

interface ActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmWord: string;
  onConfirm: (payload: { comment?: string; confirmationText: string; password?: string }) => Promise<void> | void;
  isLoading?: boolean;
  loadingText?: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  showComment?: boolean;
  commentLabel?: string;
  commentPlaceholder?: string;
  icon?: React.ReactNode;
  requirePassword?: boolean;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  strictConfirm?: boolean;
}

export function ActionConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  onConfirm,
  isLoading = false,
  loadingText = "Procesando...",
  confirmText = "Confirmar",
  variant = "default",
  showComment = false,
  commentLabel = "Comentario (opcional)",
  commentPlaceholder = "",
  icon,
  requirePassword = false,
  passwordLabel = "Contraseña",
  passwordPlaceholder = "Introduce tu contraseña",
  strictConfirm = false,
}: ActionConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [comment, setComment] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isMatch = strictConfirm ? typed === confirmWord : typed.trim().toLowerCase() === confirmWord.toLowerCase();
  const canConfirm = isMatch && (!requirePassword || !!password);

  const handleClose = (val: boolean) => {
    if (!val) {
      setTyped("");
      setComment("");
      setPassword("");
      setError(null);
    }
    onOpenChange(val);
  };

  const handleConfirm = async () => {
    if (!isMatch) {
      setError(`Debes escribir exactamente ${confirmWord}.`);
      return;
    }

    if (requirePassword && !password) {
      setError("Debes introducir tu contraseña actual.");
      return;
    }

    setError(null);
    try {
      await onConfirm({
        comment: showComment ? comment : undefined,
        confirmationText: typed,
        password: requirePassword ? password : undefined,
      });
      setTyped("");
      setComment("");
      setPassword("");
    } catch (confirmError) {
      const message = confirmError instanceof Error ? confirmError.message : "No se pudo completar la acción.";
      setError(message);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">
              Escribe <strong className="font-semibold text-foreground">{confirmWord}</strong> para confirmar
            </Label>
            <Input
              className="mt-1"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                if (error) setError(null);
              }}
              placeholder={confirmWord}
              autoFocus
            />
          </div>
          {requirePassword && (
            <div>
              <Label className="text-sm">{passwordLabel}</Label>
              <Input
                className="mt-1"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={passwordPlaceholder}
                autoComplete="current-password"
              />
            </div>
          )}
          {showComment && (
            <div>
              <Label className="text-sm">{commentLabel}</Label>
              <Textarea
                className="mt-1"
                placeholder={commentPlaceholder}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={!canConfirm || isLoading}
            className={cn(
              variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {isLoading ? loadingText : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
