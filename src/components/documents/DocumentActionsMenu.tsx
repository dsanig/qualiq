import { 
  MoreVertical, 
  Pencil, 
  History, 
  Users, 
  Download, 
  Archive, 
  Share2, 
  Lock, 
  Unlock, 
  Eye,
  Trash2,
  PenTool,
  ArrowRightLeft,
  UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DocumentActionsMenuProps {
  documentId: string;
  isLocked?: boolean;
  onEdit?: () => void;
  onViewHistory?: () => void;
  onViewOwners?: () => void;
  onDownload?: () => void;
  onArchive?: () => void;
  onShare?: () => void;
  onToggleLock?: () => void;
  onView?: () => void;
  onDelete?: () => void;
  onSign?: () => void;
  onSignManual?: () => void;
  onChangeStatus?: () => void;
  onManageResponsibilities?: () => void;
}

export function DocumentActionsMenu({
  documentId,
  isLocked = false,
  onEdit,
  onViewHistory,
  onViewOwners,
  onDownload,
  onArchive,
  onShare,
  onToggleLock,
  onView,
  onDelete,
  onSign,
  onSignManual,
  onChangeStatus,
  onManageResponsibilities,
}: DocumentActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-popover">
        <DropdownMenuItem onClick={onView} className="cursor-pointer">
          <Eye className="w-4 h-4 mr-2" />
          Ver Documento
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit} disabled={isLocked} className="cursor-pointer">
          <Pencil className="w-4 h-4 mr-2" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onChangeStatus} className="cursor-pointer">
          <ArrowRightLeft className="w-4 h-4 mr-2" />
          Cambiar Estado
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onManageResponsibilities} className="cursor-pointer">
          <UserCheck className="w-4 h-4 mr-2" />
          Responsables
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onViewHistory} className="cursor-pointer">
          <History className="w-4 h-4 mr-2" />
          Historial de Versiones
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewOwners} className="cursor-pointer">
          <Users className="w-4 h-4 mr-2" />
          Ver Propietarios
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDownload} className="cursor-pointer">
          <Download className="w-4 h-4 mr-2" />
          Descargar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSign} className="cursor-pointer">
          <PenTool className="w-4 h-4 mr-2" />
          Firmar con DNIe
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSignManual} className="cursor-pointer">
          <Pencil className="w-4 h-4 mr-2" />
          Firmar con nombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onShare} className="cursor-pointer">
          <Share2 className="w-4 h-4 mr-2" />
          Compartir
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleLock} className="cursor-pointer">
          {isLocked ? (
            <>
              <Unlock className="w-4 h-4 mr-2" />
              Desbloquear
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 mr-2" />
              Bloquear
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive} className="cursor-pointer">
          <Archive className="w-4 h-4 mr-2" />
          Archivar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
