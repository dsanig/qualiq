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
  onConfirm: (comment?: string) => void;
  isLoading?: boolean;
  loadingText?: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  showComment?: boolean;
  commentLabel?: string;
  commentPlaceholder?: string;
  icon?: React.ReactNode;
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
}: ActionConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [comment, setComment] = useState("");

  const isMatch = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  const handleClose = (val: boolean) => {
    if (!val) {
      setTyped("");
      setComment("");
    }
    onOpenChange(val);
  };

  const handleConfirm = () => {
    if (!isMatch) return;
    onConfirm(showComment ? comment : undefined);
    setTyped("");
    setComment("");
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
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              autoFocus
            />
          </div>
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
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={!isMatch || isLoading}
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
