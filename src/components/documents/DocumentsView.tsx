import { Fragment, useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  Filter,
  Plus,
  FolderOpen,
  CheckCircle,
  Clock,
  ClipboardList,
  AlertCircle,
  FileSpreadsheet,
  File,
  UploadCloud,
  Download,
  Trash2,
  X,
  ArrowRightLeft,
  UserCheck,
  PenTool,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DocumentActionsMenu } from "./DocumentActionsMenu";
import { DocumentResponsibilities } from "./DocumentResponsibilities";
import { DocumentSignatureStatusDialog } from "./DocumentSignatureStatusDialog";
import { DocumentPendingActions } from "./DocumentPendingActions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { debugFileTypeMapping, fileTypeForDb, getFileExtension, runFileTypeRuntimeChecks } from "@/utils/fileTypes";
import type { FiltersState } from "@/components/filters/FilterModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { matchesNormalizedQuery } from "@/utils/search";

type DocumentTypology = "Proceso" | "PNT" | "Documento" | "Normativa" | "Otro";

interface Document {
  id: string;
  code: string;
  title: string;
  typology: DocumentTypology;
  category: string;
  categoryId: string;
  version: string;
  versionNum: number;
  status: "approved" | "draft" | "review" | "pending_signature" | "pending_approval" | "obsolete" | "archived";
  lastUpdated: string;
  owner: string;
  ownerId: string;
  pageCount: number;
  format: "pdf" | "docx" | "xlsx";
  originalAuthor: string;
  lastModifiedBy: string;
  fileUrl: string;
  description?: string;
}

interface SignedDocument {
  file?: File;
  signedAt: string;
  signerName: string;
  reason?: string;
  id?: string;
}

interface VersionRecord {
  id: string;
  version: number;
  file_url: string;
  changes_description: string | null;
  created_at: string;
  created_by: string;
  creatorName?: string;
}

// Build AutoFirma invocation URL using afirma:// protocol
function buildAutoFirmaUrl(fileB64: string, fileName: string): string {
  const params = new URLSearchParams({
    op: "sign",
    format: "CAdES",
    algorithm: "SHA256withRSA",
    dat: fileB64,
    filename: fileName,
  });
  return `afirma://sign?${params.toString()}`;
}

const normalizeDocumentFileType = (fileType?: string): Document["format"] => {
  const normalizedType = fileType?.toLowerCase();

  if (normalizedType === "doc" || normalizedType === "docx" || normalizedType === "word") {
    return "docx";
  }

  if (normalizedType === "xls" || normalizedType === "xlsx" || normalizedType === "excel") {
    return "xlsx";
  }

  return "pdf";
};

const categoryOptions = [
  { id: "all", label: "Todos" },
  { id: "calidad", label: "Calidad" },
  { id: "produccion", label: "Producción" },
  { id: "logistica", label: "Logística" },
  { id: "rrhh", label: "RRHH" },
  { id: "regulatory", label: "Regulatorio" },
];

const typologyOptions: Array<{ value: DocumentTypology; label: string }> = [
  { value: "Proceso", label: "Proceso" },
  { value: "PNT", label: "PNT" },
  { value: "Documento", label: "Documento" },
  { value: "Normativa", label: "Normativa" },
  { value: "Otro", label: "Otro" },
];

const typologyNormalizeMap: Record<string, DocumentTypology> = {
  proceso: "Proceso",
  pnt: "PNT",
  documento: "Documento",
  normativa: "Normativa",
  otro: "Otro",
  Proceso: "Proceso",
  PNT: "PNT",
  Documento: "Documento",
  Normativa: "Normativa",
  Otro: "Otro",
};

const normalizeTypology = (value: string | null | undefined): DocumentTypology => {
  if (!value?.trim()) return "Documento";

  const normalizedValue = value.trim();
  
  // Direct match
  if (typologyNormalizeMap[normalizedValue]) {
    return typologyNormalizeMap[normalizedValue];
  }

  // Case-insensitive match
  const lowerCased = normalizedValue.toLowerCase();
  const ciMap: Record<string, DocumentTypology> = {
    proceso: "Proceso",
    pnt: "PNT",
    documento: "Documento",
    normativa: "Normativa",
    otro: "Otro",
  };

  return ciMap[lowerCased] ?? "Documento";
};

const isMissingTypologyColumnError = (error: { message?: string; details?: string; hint?: string } | null) => {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return (
    text.includes("Could not find the 'typology' column") ||
    text.includes("column documents.typology does not exist")
  );
};

const typologyLabelMap: Record<DocumentTypology, string> = Object.fromEntries(
  typologyOptions.map((option) => [option.value, option.label])
) as Record<DocumentTypology, string>;

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; class: string }> = {
  approved: { label: "Aprobado", icon: CheckCircle, class: "text-success" },
  draft: { label: "Borrador", icon: Clock, class: "text-muted-foreground" },
  review: { label: "En Revisión", icon: AlertCircle, class: "text-warning" },
  pending_signature: { label: "Pendiente de Firma", icon: PenTool, class: "text-primary" },
  pending_approval: { label: "Pendiente de Aprobación", icon: ClipboardList, class: "text-primary" },
  obsolete: { label: "Obsoleto", icon: AlertCircle, class: "text-destructive" },
  archived: { label: "Archivado", icon: AlertCircle, class: "text-muted-foreground" },
};

const defaultStatus = { label: "Desconocido", icon: AlertCircle, class: "text-muted-foreground" };

const statusOptions = [
  { value: "draft", label: "Borrador" },
  { value: "review", label: "En Revisión" },
  { value: "pending_signature", label: "Pendiente de Firma" },
  { value: "pending_approval", label: "Pendiente de Aprobación" },
  { value: "approved", label: "Aprobado" },
];

interface StatusChangeRecord {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  changed_at: string;
  comment: string | null;
  changerName?: string;
}

interface DocumentsViewProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
  onOpenFilters: () => void;
  isNewDocumentOpen: boolean;
  onNewDocumentOpenChange: (open: boolean) => void;
}

export function DocumentsView({
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  onOpenFilters,
  isNewDocumentOpen,
  onNewDocumentOpenChange,
}: DocumentsViewProps) {
  const saveDocumentSignature = useCallback(async (payload: {
    document_id: string;
    signed_by: string;
    signer_name: string;
    signer_email: string | null;
    signature_method: "autofirma_dnie" | "nombre_completo";
    signature_data: string | null;
    signed_at: string;
  }) => {
    const { data: updatedRows, error: updateError } = await supabase
      .from("document_signatures")
      .update(payload)
      .eq("document_id", payload.document_id)
      .eq("signed_by", payload.signed_by)
      .select("id")
      .limit(1);

    if (updateError) {
      throw updateError;
    }

    if ((updatedRows?.length || 0) > 0) {
      // Also mark the responsibility as completed
      await supabase
        .from("document_responsibilities")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("document_id", payload.document_id)
        .eq("user_id", payload.signed_by)
        .eq("action_type", "firma")
        .eq("status", "pending");
      return;
    }

    const { error: insertError } = await supabase
      .from("document_signatures")
      .insert(payload);

    if (insertError) {
      throw insertError;
    }

    // Mark the corresponding firma responsibility as completed
    await supabase
      .from("document_responsibilities")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("document_id", payload.document_id)
      .eq("user_id", payload.signed_by)
      .eq("action_type", "firma")
      .eq("status", "pending");
  }, []);

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showAllDocuments, setShowAllDocuments] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [expandedResponsibilities, setExpandedResponsibilities] = useState<Record<string, Array<{ action_type: string; user_id: string; due_date: string; status: string; userName?: string }>>>({});
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOwnersOpen, setIsOwnersOpen] = useState(false);
  const [isSignOpen, setIsSignOpen] = useState(false);
  const [isManualSignOpen, setIsManualSignOpen] = useState(false);
  const [manualSignName, setManualSignName] = useState("");
  const [manualSignReason, setManualSignReason] = useState("");
  const [signStatus, setSignStatus] = useState<"idle" | "waiting" | "completed">("idle");
  const [signReason, setSignReason] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signedDocuments, setSignedDocuments] = useState<Record<string, SignedDocument>>({});
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { canEditContent, canManageCompany, isSuperadmin, refreshPermissions } = usePermissions();

  // Edit document state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editDocCode, setEditDocCode] = useState("");
  const [editDocTitle, setEditDocTitle] = useState("");
  const [editDocCategory, setEditDocCategory] = useState("calidad");
  const [editDocTypology, setEditDocTypology] = useState<DocumentTypology>("Documento");
  const [editDocStatus, setEditDocStatus] = useState("draft");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

  // Update version state
  const [isUpdateVersionOpen, setIsUpdateVersionOpen] = useState(false);
  const [updateVersionFile, setUpdateVersionFile] = useState<File | null>(null);
  const [updateVersionChanges, setUpdateVersionChanges] = useState("");
  const [updateVersionResponsibilities, setUpdateVersionResponsibilities] = useState<InlineResponsibility[]>([]);
  const [updateRespUserId, setUpdateRespUserId] = useState("");
  const [updateRespAction, setUpdateRespAction] = useState("revision");
  const [updateRespDueDate, setUpdateRespDueDate] = useState("");
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);

  // Version history
  const [versionHistory, setVersionHistory] = useState<VersionRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Status change state
  const [isChangeStatusOpen, setIsChangeStatusOpen] = useState(false);
  const [changeStatusTarget, setChangeStatusTarget] = useState<string>("draft");
  const [changeStatusComment, setChangeStatusComment] = useState("");
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [statusHistory, setStatusHistory] = useState<StatusChangeRecord[]>([]);
  const [isStatusHistoryOpen, setIsStatusHistoryOpen] = useState(false);
  const [isLoadingStatusHistory, setIsLoadingStatusHistory] = useState(false);
  
  // Responsibilities state
  const [isResponsibilitiesOpen, setIsResponsibilitiesOpen] = useState(false);
  const [isSignatureStatusOpen, setIsSignatureStatusOpen] = useState(false);
  const [isPendingActionsOpen, setIsPendingActionsOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  // New document form state
  const [newDocCode, setNewDocCode] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocCategory, setNewDocCategory] = useState("calidad");
  const [newDocTypology, setNewDocTypology] = useState<DocumentTypology | "">("");
  const [newDocDescription, setNewDocDescription] = useState("");
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  interface InlineResponsibility {
    userId: string;
    actionType: string;
    dueDate: string;
  }
  // Inline responsibilities for new document
  const [newDocResponsibilities, setNewDocResponsibilities] = useState<InlineResponsibility[]>([]);
  const [newRespUserId, setNewRespUserId] = useState("");
  const [newRespAction, setNewRespAction] = useState("revision");
  const [newRespDueDate, setNewRespDueDate] = useState("");
  const [companyUsers, setCompanyUsers] = useState<{ user_id: string; full_name: string | null; email: string }[]>([]);

   // Real documents from database
  const [dbDocuments, setDbDocuments] = useState<Document[]>([]);

  // Signature status per document: { docId: { totalSigners, signedCount } }
  const [firmaStatus, setFirmaStatus] = useState<Record<string, { total: number; signed: number }>>({});

  // Track which documents have been rejected (have rejected responsibilities)
  const [rejectedDocIds, setRejectedDocIds] = useState<Set<string>>(new Set());

  const fetchRejectedDocs = useCallback(async () => {
    if (!profile?.company_id) return;
    const { data } = await (supabase as any)
      .from("document_responsibilities")
      .select("document_id")
      .eq("status", "rejected");
    if (data) {
      setRejectedDocIds(new Set((data as any[]).map((r: any) => r.document_id)));
    }
  }, [profile?.company_id]);

  // Fetch signatures from DB
  const fetchSignatures = useCallback(async () => {
    if (!profile?.company_id || !user) return;
    const { data } = await supabase
      .from("document_signatures")
      .select("*")
      .eq("signed_by", user.id);
    if (data) {
      const mapped: Record<string, SignedDocument> = {};
      for (const sig of data) {
        mapped[sig.document_id] = {
          signedAt: sig.signed_at,
          signerName: sig.signer_name || "Desconocido",
          reason: sig.signature_data || undefined,
          id: sig.id,
        };
      }
      setSignedDocuments(mapped);
    }
  }, [profile?.company_id, user]);

  // Fetch firma responsibilities and signatures to compute signature status
  const fetchFirmaStatus = useCallback(async () => {
    if (!profile?.company_id) return;
    // Get all firma responsibilities
    const { data: firmaResps } = await (supabase as any)
      .from("document_responsibilities")
      .select("document_id, user_id, status")
      .eq("action_type", "firma");
    
    // Get all signatures
    const { data: sigs } = await supabase
      .from("document_signatures")
      .select("document_id, signed_by");

    const sigSet = new Set((sigs || []).map(s => `${s.document_id}:${s.signed_by}`));

    const statusMap: Record<string, { total: number; signed: number }> = {};
    for (const r of (firmaResps as any[] || [])) {
      if (!statusMap[r.document_id]) statusMap[r.document_id] = { total: 0, signed: 0 };
      statusMap[r.document_id].total++;
      if (r.status === "completed" || sigSet.has(`${r.document_id}:${r.user_id}`)) {
        statusMap[r.document_id].signed++;
      }
    }
    setFirmaStatus(statusMap);
  }, [profile?.company_id]);

  const fetchDocuments = useCallback(async () => {
    if (!profile?.company_id) return;

    let query = supabase
      .from("documents")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false });

    if (filters.documentTypology !== "all") {
      query = query.eq("typology", filters.documentTypology as string);
    }

    const { data, error } = await query;

    if (isMissingTypologyColumnError(error)) {
      toast({
        title: "Tipología no disponible aún en este entorno",
        description: "Se reintentará la carga de documentos sin este filtro.",
      });

      if (filters.documentTypology !== "all") {
        onFiltersChange({ ...filters, documentTypology: "all" });
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from("documents")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });

      if (fallbackError || !fallbackData) return;

      const ownerUserIds = [...new Set(fallbackData.map((doc) => doc.owner_id).filter(Boolean))];

      const { data: ownersData } = ownerUserIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, full_name, email")
            .in("user_id", ownerUserIds)
        : { data: [] };

      const ownerUserMap = new Map(
        (ownersData || []).map((owner) => [
          owner.user_id,
          owner.full_name?.trim() || owner.email || owner.user_id,
        ])
      );

      const mapped: Document[] = fallbackData.map((d) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        typology: normalizeTypology(d.typology),
        category: d.category,
        categoryId: d.category.toLowerCase().replace(/ó/g, "o").replace(/í/g, "i"),
        version: String(d.version) + ".0",
        versionNum: d.version,
        status: d.status as Document["status"],
        lastUpdated: new Date(d.updated_at).toISOString().split("T")[0],
        owner: ownerUserMap.get(d.owner_id) || d.owner_id,
        ownerId: d.owner_id,
        pageCount: 0,
        format: normalizeDocumentFileType(d.file_type),
        originalAuthor: ownerUserMap.get(d.owner_id) || d.owner_id,
        lastModifiedBy: ownerUserMap.get(d.owner_id) || d.owner_id,
        fileUrl: d.file_url,
      }));
      setDbDocuments(mapped);
      return;
    }

    if (!error && data) {
      const ownerUserIds = [...new Set(data.map((doc) => doc.owner_id).filter(Boolean))];

      const { data: ownersData } = ownerUserIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, full_name, email")
            .in("user_id", ownerUserIds)
        : { data: [] };

      const ownerUserMap = new Map(
        (ownersData || []).map((owner) => [
          owner.user_id,
          owner.full_name?.trim() || owner.email || owner.user_id,
        ])
      );

      const mapped: Document[] = data.map((d) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        typology: normalizeTypology(d.typology),
        category: d.category,
        categoryId: d.category.toLowerCase().replace(/ó/g, "o").replace(/í/g, "i"),
        version: String(d.version) + ".0",
        versionNum: d.version,
        status: d.status as Document["status"],
        lastUpdated: new Date(d.updated_at).toISOString().split("T")[0],
        owner: ownerUserMap.get(d.owner_id) || d.owner_id,
        ownerId: d.owner_id,
        pageCount: 0,
        format: normalizeDocumentFileType(d.file_type),
        originalAuthor: ownerUserMap.get(d.owner_id) || d.owner_id,
        lastModifiedBy: ownerUserMap.get(d.owner_id) || d.owner_id,
        fileUrl: d.file_url,
      }));
      setDbDocuments(mapped);
    }
  }, [filters, onFiltersChange, profile?.company_id, toast]);

  const fetchCompanyUsers = useCallback(async () => {
    if (!profile?.company_id) return;
    const { data } = await supabase.from("profiles").select("user_id, full_name, email").eq("company_id", profile.company_id);
    setCompanyUsers(data || []);
  }, [profile?.company_id]);

  useEffect(() => {
    fetchDocuments();
    fetchSignatures();
    fetchCompanyUsers();
    fetchFirmaStatus();
    fetchRejectedDocs();
  }, [fetchDocuments, fetchSignatures, fetchCompanyUsers, fetchFirmaStatus, fetchRejectedDocs]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  useEffect(() => {
    runFileTypeRuntimeChecks();
  }, []);

  const allDocuments = useMemo(() => [...dbDocuments], [dbDocuments]);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // --- Edit document ---
  const handleOpenEdit = (doc: Document) => {
    setEditingDocId(doc.id);
    setEditDocCode(doc.code);
    setEditDocTitle(doc.title);
    setEditDocCategory(doc.categoryId);
    setEditDocTypology(doc.typology);
    setEditDocStatus(doc.status);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDocId) return;
    setIsEditSaving(true);
    try {
      const updatePayload = {
        code: editDocCode.trim(),
        title: editDocTitle.trim(),
        category: editDocCategory.charAt(0).toUpperCase() + editDocCategory.slice(1),
        typology: editDocTypology,
        status: editDocStatus as any,
      };

      console.log("UPDATE payload", updatePayload);

      const { data, error, status, count } = await supabase
        .from("documents")
        .update(updatePayload as any)
        .eq("id", editingDocId)
        .eq("company_id", profile?.company_id ?? "")
        .select("id, typology");

      console.log("UPDATE result", { data, error, status, count, rowCount: data?.length ?? 0 });

      if (isMissingTypologyColumnError(error)) {
        toast({
          title: "Tipología no disponible aún",
          description: "El sistema aún no está actualizado. Intenta más tarde.",
          variant: "destructive",
        });
        return;
      } else if (error) {
        throw error;
      }

      if (!isMissingTypologyColumnError(error) && (data?.length ?? 0) === 0) {
        console.error("[documents] update without affected rows", {
          documentId: editingDocId,
          userId: user?.id,
          companyId: profile?.company_id,
        });
        toast({
          title: "Sin cambios",
          description: "No se pudo actualizar el documento (sin permisos o id inválido)",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Documento actualizado" });
      setIsEditOpen(false);
      fetchDocuments();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsEditSaving(false);
    }
  };

  // --- Status change ---
  const handleOpenChangeStatus = (doc: Document) => {
    setSelectedDocument(doc);
    setChangeStatusTarget(doc.status);
    setChangeStatusComment("");
    setIsChangeStatusOpen(true);
  };

  const handleChangeStatus = async () => {
    if (!selectedDocument || !user) return;
    if (changeStatusTarget === selectedDocument.status) {
      toast({ title: "Sin cambios", description: "Selecciona un estado diferente.", variant: "destructive" });
      return;
    }
    setIsChangingStatus(true);
    try {
      const currentStatus = selectedDocument.status;

      // STRICT LINEAR WORKFLOW: draft → review → pending_signature → pending_approval → approved
      // Only allowed manual transitions: draft→review and pending_approval→approved
      // pending_signature and pending_approval are automatic transitions

      if (changeStatusTarget === "review") {
        if (currentStatus !== "draft") {
          toast({ title: "Transición no permitida", description: "Solo se puede pasar a 'En Revisión' desde 'Borrador'.", variant: "destructive" });
          return;
        }
        // Only document owner or editors can send to review
        const isOwner = selectedDocument.ownerId === user.id;
        if (!isOwner && !canEditContent) {
          toast({ title: "Permisos insuficientes", description: "Solo el propietario del documento o un editor puede enviarlo a revisión.", variant: "destructive" });
          return;
        }
      } else if (changeStatusTarget === "pending_signature") {
        toast({ title: "Transición automática", description: "El documento pasará a 'Pendiente de Firma' automáticamente cuando todos los revisores completen su revisión.", variant: "destructive" });
        return;
      } else if (changeStatusTarget === "pending_approval") {
        toast({ title: "Transición automática", description: "El documento pasará a 'Pendiente de Aprobación' automáticamente cuando todos los firmantes completen su firma.", variant: "destructive" });
        return;
      } else if (changeStatusTarget === "approved") {
        if (currentStatus !== "pending_approval") {
          toast({ title: "Transición no permitida", description: "Solo se puede aprobar un documento que esté 'Pendiente de Aprobación'.", variant: "destructive" });
          return;
        }
        // Check if user has aprobacion responsibility
        const allowed = await canPerformAction(user.id, selectedDocument.id, "aprobacion");
        if (!allowed) {
          toast({ title: "Permisos insuficientes", description: "Solo el responsable de aprobación asignado puede aprobar este documento.", variant: "destructive" });
          return;
        }
      } else {
        toast({ title: "Transición no permitida", description: "Esta transición de estado no está permitida.", variant: "destructive" });
        return;
      }

      // Update document status
      const { error: updateError } = await supabase.from("documents").update({
        status: changeStatusTarget as any,
      }).eq("id", selectedDocument.id);
      if (updateError) throw updateError;

      // Record the status change
      const { error: insertError } = await (supabase as any).from("document_status_changes").insert({
        document_id: selectedDocument.id,
        old_status: selectedDocument.status,
        new_status: changeStatusTarget,
        changed_by: user.id,
        comment: changeStatusComment.trim() || null,
      });
      if (insertError) throw insertError;

      const statusLabel = statusOptions.find(s => s.value === changeStatusTarget)?.label || statusConfig[changeStatusTarget]?.label || changeStatusTarget;
      toast({ title: "Estado actualizado", description: `El documento ahora está en "${statusLabel}".` });
      setIsChangeStatusOpen(false);
      fetchDocuments();
      fetchFirmaStatus();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsChangingStatus(false);
    }
  };

  const fetchStatusHistory = async (docId: string) => {
    setIsLoadingStatusHistory(true);
    const { data, error } = await (supabase as any)
      .from("document_status_changes")
      .select("id, old_status, new_status, changed_by, changed_at, comment")
      .eq("document_id", docId)
      .order("changed_at", { ascending: false });
    if (!error && data) {
      const userIds = [...new Set((data as StatusChangeRecord[]).map(s => s.changed_by))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name || p.email || p.user_id]));
      setStatusHistory((data as StatusChangeRecord[]).map(s => ({ ...s, changerName: nameMap.get(s.changed_by) || s.changed_by })));
    } else {
      setStatusHistory([]);
    }
    setIsLoadingStatusHistory(false);
  };

  const handleOpenStatusHistory = (doc: Document) => {
    setSelectedDocument(doc);
    setIsStatusHistoryOpen(true);
    fetchStatusHistory(doc.id);
  };

  // --- Version history ---
  const fetchVersionHistory = async (docId: string) => {
    setIsLoadingHistory(true);
    const { data, error } = await (supabase as any)
      .from("document_versions")
      .select("id, version, file_url, changes_description, created_at, created_by")
      .eq("document_id", docId)
      .order("version", { ascending: false });
    if (!error && data) {
      const userIds = [...new Set((data as VersionRecord[]).map((v) => v.created_by))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };
      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name || p.email || p.user_id]));
      setVersionHistory((data as VersionRecord[]).map((v) => ({ ...v, creatorName: nameMap.get(v.created_by) || v.created_by })));
    } else {
      setVersionHistory([]);
    }
    setIsLoadingHistory(false);
  };

  const handleOpenHistory = (doc: Document) => {
    setSelectedDocument(doc);
    setIsHistoryOpen(true);
    fetchVersionHistory(doc.id);
  };

  const handleDownloadVersion = async (fileUrl: string, version: number, docCode: string) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(fileUrl, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Error", description: "No se pudo generar el enlace.", variant: "destructive" });
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = `${docCode}-v${version}`;
    link.target = "_blank";
    link.click();
  };

  const handleDeleteVersion = async (versionId: string) => {
    const { error } = await (supabase as any).from("document_versions").delete().eq("id", versionId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Versión eliminada" });
    if (selectedDocument) fetchVersionHistory(selectedDocument.id);
  };

  // --- Update version ---
  const fetchDocumentResponsibilities = useCallback(async (docId: string): Promise<InlineResponsibility[]> => {
    const { data, error } = await (supabase as any)
      .from("document_responsibilities")
      .select("user_id, action_type, due_date")
      .eq("document_id", docId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return (data || []).map((r: { user_id: string; action_type: string; due_date: string }) => ({
      userId: r.user_id,
      actionType: r.action_type,
      dueDate: r.due_date,
    }));
  }, []);

  const handleOpenUpdateVersion = async (doc: Document) => {
    setSelectedDocument(doc);
    setUpdateVersionFile(null);
    setUpdateVersionChanges("");
    setUpdateVersionResponsibilities([]);
    setUpdateRespUserId("");
    setUpdateRespAction("revision");
    setUpdateRespDueDate("");
    setIsUpdateVersionOpen(true);

    try {
      const currentResponsibilities = await fetchDocumentResponsibilities(doc.id);
      setUpdateVersionResponsibilities(currentResponsibilities);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateVersion = async () => {
    if (!selectedDocument || !user || !profile?.company_id) return;
    if (!updateVersionFile) {
      toast({ title: "Archivo requerido", description: "Selecciona un archivo para actualizar la versión.", variant: "destructive" });
      return;
    }
    setIsUpdatingVersion(true);
    try {
      const newVersion = selectedDocument.versionNum + 1;
      const fileType = fileTypeForDb(updateVersionFile);
      const fileExt = getFileExtension(updateVersionFile.name) || "bin";
      debugFileTypeMapping(updateVersionFile);
      const filePath = `${profile.company_id}/${selectedDocument.id}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, updateVersionFile);
      if (uploadError) throw uploadError;

      const cleanedResponsibilities = updateVersionResponsibilities
        .filter((r) => r.userId && r.actionType && r.dueDate)
        .map((r) => ({
          responsible_user_id: r.userId,
          action_type: r.actionType,
          due_date: r.dueDate,
        }));

      if (cleanedResponsibilities.length === 0) {
        throw new Error("Debes asignar al menos un responsable para crear la nueva versión.");
      }

      // Validate at least one responsible per action type
      const requiredActions = ["revision", "firma", "aprobacion"];
      const missingActions = requiredActions.filter(
        action => !cleanedResponsibilities.some(r => r.action_type === action)
      );
      if (missingActions.length > 0) {
        const labels: Record<string, string> = { revision: "Revisión", firma: "Firma", aprobacion: "Aprobación" };
        const missing = missingActions.map(a => labels[a]).join(", ");
        throw new Error(`Debes asignar al menos un responsable de: ${missing}.`);
      }

      const createVersionArgs = {
        _change_summary: updateVersionChanges.trim() || null,
        _document_id: selectedDocument.id,
        _file_path: filePath,
        _responsibilities: cleanedResponsibilities,
      };

      const fallbackToClientVersionUpdate = async () => {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError ?? new Error("No se pudo obtener el usuario autenticado.");

        const actorId = authData.user.id;
        const nextVersion = selectedDocument.versionNum + 1;

        const { error: versionInsertError } = await (supabase as any).from("document_versions").insert({
          document_id: selectedDocument.id,
          version: selectedDocument.versionNum,
          file_url: selectedDocument.fileUrl,
          changes_description: updateVersionChanges.trim() || null,
          created_by: actorId,
        });
        if (versionInsertError) throw versionInsertError;

        const { error: docUpdateError } = await (supabase as any)
          .from("documents")
          .update({
            version: nextVersion,
            file_url: filePath,
            file_type: fileType,
            status: "draft",
          })
          .eq("id", selectedDocument.id);
        if (docUpdateError) throw docUpdateError;

        const { error: deleteRespError } = await (supabase as any)
          .from("document_responsibilities")
          .delete()
          .eq("document_id", selectedDocument.id);
        if (deleteRespError) throw deleteRespError;

        const fallbackResponsibilities = cleanedResponsibilities.map((responsibility) => ({
          document_id: selectedDocument.id,
          user_id: responsibility.responsible_user_id,
          action_type: responsibility.action_type,
          due_date: responsibility.due_date,
          created_by: actorId,
        }));

        const { error: respInsertError } = await (supabase as any)
          .from("document_responsibilities")
          .insert(fallbackResponsibilities);
        if (respInsertError) throw respInsertError;
      };

      if (import.meta.env.DEV) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        console.log("SUPABASE_URL_HOST", new URL(supabaseUrl).host);
        const { data: authData, error: authError } = await supabase.auth.getUser();
        const payloadTypes = Object.fromEntries(
          Object.entries(createVersionArgs).map(([key, value]) => [
            key,
            Array.isArray(value) ? "array" : typeof value,
          ]),
        );
        const projectHostname = (() => {
          try {
            return new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
          } catch {
            return "invalid-url";
          }
        })();

        console.info("[documents:update-version] RPC preflight", {
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          projectHostname,
          payloadKeys: Object.keys(createVersionArgs),
          payloadTypes,
          payloadJson: JSON.stringify(createVersionArgs),
          authUserId: authData.user?.id ?? null,
          authError: authError?.message ?? null,
        });
      }

      const { error: rpcError } = await (supabase as any).rpc("create_new_document_version", createVersionArgs);

      if (rpcError) {
        const isMissingRpc = rpcError.message?.includes("Could not find the function public.create_new_document_version")
          || rpcError.message?.includes("schema cache");

        if (!isMissingRpc) throw rpcError;

        console.warn("[documents:update-version] RPC missing: check Supabase project/env. Falling back to client flow.", {
          errorCode: rpcError.code,
          errorMessage: rpcError.message,
        });

        // TODO: Remove this fallback after confirming RPC is deployed in the same Supabase project used by the app.
        await fallbackToClientVersionUpdate();
      }

      const { error: updateError } = await supabase.from("documents").update({ file_type: fileType }).eq("id", selectedDocument.id);
      if (updateError) throw updateError;

      toast({ title: "Versión actualizada", description: `El documento ahora está en v${newVersion}.0` });
      setIsUpdateVersionOpen(false);
      fetchDocuments();
      fetchFirmaStatus();
      fetchRejectedDocs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsUpdatingVersion(false);
    }
  };

  const handleAddUpdateResponsibility = () => {
    if (!updateRespUserId || !updateRespDueDate) {
      toast({ title: "Campos requeridos", description: "Selecciona usuario, acción y fecha límite.", variant: "destructive" });
      return;
    }

    setUpdateVersionResponsibilities((prev) => [
      ...prev,
      { userId: updateRespUserId, actionType: updateRespAction, dueDate: updateRespDueDate },
    ]);
    setUpdateRespUserId("");
    setUpdateRespAction("revision");
    setUpdateRespDueDate("");
  };

  const handleRemoveUpdateResponsibility = (index: number) => {
    setUpdateVersionResponsibilities((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadDocument = async () => {
    if (!newDocCode.trim() || !newDocTitle.trim()) {
      toast({ title: "Campos requeridos", description: "Completa código y título.", variant: "destructive" });
      return;
    }
    if (!newDocFile) {
      toast({ title: "Archivo requerido", description: "Selecciona un archivo para continuar.", variant: "destructive" });
      return;
    }
    if (!newDocTypology) {
      toast({ title: "Tipología requerida", description: "Selecciona una tipología para guardar el documento.", variant: "destructive" });
      return;
    }
    // Validate at least one responsible per action type
    const requiredActions = ["revision", "firma", "aprobacion"];
    const missingActions = requiredActions.filter(
      action => !newDocResponsibilities.some(r => r.actionType === action && r.userId)
    );
    if (missingActions.length > 0) {
      const labels: Record<string, string> = { revision: "Revisión", firma: "Firma", aprobacion: "Aprobación" };
      const missing = missingActions.map(a => labels[a]).join(", ");
      toast({ title: "Responsables obligatorios", description: `Debes asignar al menos un responsable de: ${missing}.`, variant: "destructive" });
      return;
    }
    if (!user || !profile?.company_id) {
      toast({ title: "Error", description: "Debes iniciar sesión.", variant: "destructive" });
      return;
    }
    if (!canEditContent) {
      toast({ title: "Permisos insuficientes", description: "Tu sesión no tiene permisos para subir documentos.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("No se pudo obtener el usuario.");

      const uploaderUser = userData.user;
      const fileType = fileTypeForDb(newDocFile);
      debugFileTypeMapping(newDocFile);

      if (import.meta.env.DEV) {
        let supabaseHost = "invalid-url";
        try {
          supabaseHost = new URL(import.meta.env.VITE_SUPABASE_URL).host;
        } catch {
          supabaseHost = "invalid-url";
        }
        console.log("SUPABASE_HOST", supabaseHost);
      }

      if (fileType === "other") {
        throw new Error("Formato no permitido. Usa PDF, Word, Excel o imagen (PNG/JPG/JPEG/WEBP).");
      }

      const documentId = crypto.randomUUID();
      const filePath = `${profile.company_id}/${documentId}/${newDocFile.name}`;

      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, newDocFile);
      if (uploadError) throw uploadError;

      const payload = {
        id: documentId,
        code: newDocCode.trim(),
        title: newDocTitle.trim(),
        category: newDocCategory.charAt(0).toUpperCase() + newDocCategory.slice(1),
        typology: newDocTypology || "Documento",
        company_id: profile.company_id,
        owner_id: uploaderUser.id,
        file_type: fileType,
        file_url: filePath,
        status: "draft" as const,
      };

      console.log("typology selected", newDocTypology);
      console.log("CREATE payload", payload);

      const { data, error: insertError, status, count } = await supabase
        .from("documents")
        .insert(payload as any)
        .select("id, typology");

      console.log("CREATE result", { data, error: insertError, status, count });

      if (isMissingTypologyColumnError(insertError)) {
        await supabase.storage.from("documents").remove([filePath]);

        toast({
          title: "Tipología no disponible aún",
          description: "El sistema aún no está actualizado. Intenta más tarde.",
          variant: "destructive",
        });
        return;
      } else if (insertError) {
        throw insertError;
      }

      if (!isMissingTypologyColumnError(insertError) && (data as any)?.[0]?.typology !== payload.typology) {
        console.warn("[documents] typology mismatch after insert", {
          expectedTypology: payload.typology,
          persistedTypology: data?.[0]?.typology,
        });
      }

      // Insert responsibilities if any
      if (newDocResponsibilities.length > 0) {
        const respRows = newDocResponsibilities.map(r => ({
          document_id: documentId,
          user_id: r.userId,
          action_type: r.actionType,
          due_date: r.dueDate,
          created_by: uploaderUser.id,
        }));
        await (supabase as any).from("document_responsibilities").insert(respRows);
      }

      toast({ title: "Documento creado", description: "El documento se ha subido correctamente." });
      onNewDocumentOpenChange(false);
      setNewDocCode("");
      setNewDocTitle("");
      setNewDocCategory("calidad");
      setNewDocTypology("");
      setNewDocDescription("");
      setNewDocFile(null);
      setNewDocResponsibilities([]);
      fetchDocuments();
    } catch (err: unknown) {
      const uploadError = err as { message?: string; details?: string; hint?: string; code?: string };
      const details = [uploadError.message, uploadError.details, uploadError.hint].filter(Boolean).join(" · ");
      toast({ title: "Error al subir", description: details || "No se pudo subir el documento.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const runRpcProbe = async () => {
      const probeArgs = {
        _change_summary: null,
        _document_id: crypto.randomUUID(),
        _file_path: "dev/rpc-probe.txt",
        _responsibilities: [],
      };
      const { error } = await (supabase as any).rpc("create_new_document_version", probeArgs);
      const projectHostname = (() => {
        try {
          return new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
        } catch {
          return "invalid-url";
        }
      })();

      console.info("[documents:update-version] RPC probe", {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        projectHostname,
        payloadKeys: Object.keys(probeArgs),
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
    };

    runRpcProbe();
  }, []);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "true");
      folderInputRef.current.setAttribute("directory", "true");
    }
  }, []);

  const categoryCounts = useMemo(() => {
    return allDocuments.reduce((acc, doc) => {
      acc[doc.categoryId] = (acc[doc.categoryId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [allDocuments]);

  const categories = useMemo(
    () =>
      categoryOptions.map((cat) => ({
        ...cat,
        count: cat.id === "all" ? allDocuments.length : categoryCounts[cat.id] ?? 0,
      })),
    [categoryCounts, allDocuments]
  );

  const filteredDocuments = useMemo(() => {
    return allDocuments.filter((doc) => {
      const matchesQuery = matchesNormalizedQuery(
        debouncedSearchQuery,
        doc.code,
        doc.title,
        doc.owner,
        doc.category,
        typologyLabelMap[doc.typology],
        doc.description,
        doc.version,
        doc.originalAuthor,
        doc.lastModifiedBy,
        doc.fileUrl,
      );

      const matchesCategory = filters.category === "all" || doc.categoryId === filters.category;
      const matchesStatus = filters.documentStatus === "all" || doc.status === filters.documentStatus;
      const matchesTypology = filters.documentTypology === "all" || doc.typology === filters.documentTypology;
      
      const isSigned = !!signedDocuments[doc.id];
      const matchesSignature =
        filters.signatureStatus === "all" ||
        (filters.signatureStatus === "signed" && isSigned) ||
        (filters.signatureStatus === "pending" && !isSigned && doc.status === "approved") ||
        (filters.signatureStatus === "not_required" && doc.status !== "approved");

      return matchesQuery && matchesCategory && matchesStatus && matchesTypology && matchesSignature;
    });
  }, [debouncedSearchQuery, filters, signedDocuments, allDocuments]);

  const effectiveItemsPerPage = showAllDocuments ? Math.max(filteredDocuments.length, 1) : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / effectiveItemsPerPage));
  const startItem = filteredDocuments.length === 0 ? 0 : (currentPage - 1) * effectiveItemsPerPage + 1;
  const paginatedDocuments = filteredDocuments.slice(
    (currentPage - 1) * effectiveItemsPerPage,
    currentPage * effectiveItemsPerPage
  );

  const handleAction = (action: string, docCode: string) => {
    toast({ title: action, description: `Acción "${action}" ejecutada para ${docCode}` });
  };

  const [deleteLinkedInfo, setDeleteLinkedInfo] = useState<string[]>([]);

  const handleRequestDelete = async (doc: Document) => {
    if (!canManageCompany && !isSuperadmin) {
      toast({
        title: "Permisos insuficientes",
        description: "Solo administradores pueden eliminar documentos.",
        variant: "destructive",
      });
      return;
    }

    // Check linked records
    const links: string[] = [];
    const [
      { count: versionsCount },
      { count: responsibilitiesCount },
      { count: signaturesCount },
      { count: trainingCount },
      { count: findingsCount },
      { count: statusChangesCount },
    ] = await Promise.all([
      supabase.from("document_versions").select("id", { count: "exact", head: true }).eq("document_id", doc.id),
      supabase.from("document_responsibilities").select("id", { count: "exact", head: true }).eq("document_id", doc.id),
      supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("document_id", doc.id),
      supabase.from("training_record_documents").select("id", { count: "exact", head: true }).eq("document_id", doc.id),
      supabase.from("audit_findings").select("id", { count: "exact", head: true }).eq("document_id", doc.id),
      supabase.from("document_status_changes").select("id", { count: "exact", head: true }).eq("document_id", doc.id),
    ]);

    if (versionsCount && versionsCount > 0) links.push(`${versionsCount} versión(es)`);
    if (responsibilitiesCount && responsibilitiesCount > 0) links.push(`${responsibilitiesCount} responsabilidad(es) asignada(s)`);
    if (signaturesCount && signaturesCount > 0) links.push(`${signaturesCount} firma(s)`);
    if (trainingCount && trainingCount > 0) links.push(`${trainingCount} registro(s) de formación`);
    if (findingsCount && findingsCount > 0) links.push(`${findingsCount} hallazgo(s) de auditoría`);
    if (statusChangesCount && statusChangesCount > 0) links.push(`${statusChangesCount} cambio(s) de estado`);

    setDeleteLinkedInfo(links);
    setDocumentToDelete(doc);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!documentToDelete) return;

    setIsDeletingDocument(true);
    try {
      const { data: versions, error: versionsError } = await supabase
        .from("document_versions")
        .select("file_url")
        .eq("document_id", documentToDelete.id);

      if (versionsError) {
        throw versionsError;
      }

      const filesToDelete = Array.from(
        new Set(
          [documentToDelete.fileUrl, ...(versions || []).map((version) => version.file_url)].filter(
            (filePath): filePath is string => Boolean(filePath && !filePath.startsWith("/docs/"))
          )
        )
      );

      // Delete dependent records first to avoid FK constraint violations
      const docId = documentToDelete.id;
      await Promise.all([
        supabase.from("training_record_documents").delete().eq("document_id", docId),
        supabase.from("document_responsibilities").delete().eq("document_id", docId),
        supabase.from("document_signatures").delete().eq("document_id", docId),
        supabase.from("document_status_changes").delete().eq("document_id", docId),
        supabase.from("document_owners").delete().eq("document_id", docId),
        supabase.from("document_versions").delete().eq("document_id", docId),
        supabase.from("audit_findings").delete().eq("document_id", docId),
      ]);

      const { error: deleteDocumentError } = await supabase.from("documents").delete().eq("id", docId);
      if (deleteDocumentError) {
        throw deleteDocumentError;
      }

      if (filesToDelete.length > 0) {
        const { error: storageDeleteError } = await supabase.storage.from("documents").remove(filesToDelete);
        if (storageDeleteError) {
          console.error("[documents] error deleting storage objects", storageDeleteError);
          toast({
            title: "Documento eliminado",
            description: "Se eliminó el registro, pero algunos archivos en storage no pudieron borrarse.",
            variant: "destructive",
          });
        }
      }

      setDbDocuments((prev) => prev.filter((doc) => doc.id !== documentToDelete.id));
      setSelectedIds((prev) => prev.filter((id) => id !== documentToDelete.id));
      if (selectedDocument?.id === documentToDelete.id) {
        setSelectedDocument(null);
        setIsPreviewOpen(false);
      }

      await Promise.all([fetchDocuments(), fetchFirmaStatus()]);

      toast({ title: "Documento eliminado", description: `${documentToDelete.code} fue eliminado correctamente.` });
      setIsDeleteConfirmOpen(false);
      setDocumentToDelete(null);
    } catch (err: any) {
      console.error("[documents] error deleting document", err);
      toast({
        title: "Error al eliminar",
        description: err?.message || "No se pudo eliminar el documento.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingDocument(false);
    }
  };

  const handleOpenPreview = (doc: Document) => {
    setSelectedDocument(doc);
    setIsPreviewOpen(true);
  };

  const handleToggleSummary = async (docId: string) => {
    const isExpanding = expandedDocumentId !== docId;
    setExpandedDocumentId((prev) => (prev === docId ? null : docId));
    if (isExpanding && !expandedResponsibilities[docId]) {
      const { data } = await (supabase as any)
        .from("document_responsibilities")
        .select("action_type, user_id, due_date, status")
        .eq("document_id", docId);
      if (data && data.length > 0) {
        const userIds = [...new Set((data as any[]).map((r: any) => r.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
        const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name || p.email || p.user_id]));
        setExpandedResponsibilities(prev => ({
          ...prev,
          [docId]: (data as any[]).map((r: any) => ({ ...r, userName: nameMap.get(r.user_id) || r.user_id })),
        }));
      } else {
        setExpandedResponsibilities(prev => ({ ...prev, [docId]: [] }));
      }
    }
  };

  const handleDownload = async (doc: Document) => {
    const signedDoc = signedDocuments[doc.id];
    if (signedDoc?.file) {
      const url = URL.createObjectURL(signedDoc.file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${doc.code}-firmado.${doc.format}`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (doc.fileUrl && !doc.fileUrl.startsWith("/docs/")) {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.fileUrl, 60);
      if (error || !data?.signedUrl) {
        toast({ title: "Error", description: "No se pudo generar el enlace de descarga.", variant: "destructive" });
        return;
      }
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = `${doc.code}.${doc.format}`;
      link.target = "_blank";
      link.click();
    } else {
      toast({ title: "Sin archivo", description: "Este documento no tiene un archivo asociado.", variant: "destructive" });
      return;
    }
    handleAction("Descargar", doc.code);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(paginatedDocuments.map((doc) => doc.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (docId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, docId] : prev.filter((id) => id !== docId)
    );
  };

  const handleCategoryChange = (categoryId: string) => {
    onFiltersChange({ ...filters, category: categoryId });
    setCurrentPage(1);
  };

  const handleOpenOwners = (doc: Document) => {
    setSelectedDocument(doc);
    setIsOwnersOpen(true);
  };

  const handleOpenSign = (doc: Document) => {
    if (doc.status !== "pending_signature") {
      toast({ title: "No se puede firmar", description: "Solo se pueden firmar documentos en estado 'Pendiente de Firma'.", variant: "destructive" });
      return;
    }
    setSelectedDocument(doc);
    const existingSignature = signedDocuments[doc.id];
    setSignStatus(existingSignature ? "completed" : "idle");
    setSignReason(existingSignature?.reason ?? "");
    setSignerName(existingSignature?.signerName ?? "");
    setIsSignOpen(true);
  };

  const canPerformAction = useCallback(async (userId: string, documentId: string, actionType: string) => {
    // No superadmin bypass — only assigned responsible users can perform actions
    const { count, error } = await (supabase as any)
      .from("document_responsibilities")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .eq("action_type", actionType);

    if (error) {
      throw error;
    }

    return (count || 0) > 0;
  }, []);

  const handleStartSigning = async () => {
    if (!selectedDocument) return;
    setSignStatus("waiting");
    toast({ title: "Invocando AutoFirma", description: "Se abrirá AutoFirma para firmar con tu DNIe." });
    try {
      if (selectedDocument.fileUrl && !selectedDocument.fileUrl.startsWith("/docs/")) {
        const { data: urlData, error } = await supabase.storage.from("documents").createSignedUrl(selectedDocument.fileUrl, 120);
        if (!error && urlData?.signedUrl) {
          const response = await fetch(urlData.signedUrl);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1] || "";
            const afirmaUrl = buildAutoFirmaUrl(base64, `${selectedDocument.code}.${selectedDocument.format}`);
            window.location.href = afirmaUrl;
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      const afirmaUrl = buildAutoFirmaUrl("", `${selectedDocument.code}.${selectedDocument.format}`);
      window.location.href = afirmaUrl;
    } catch (err) {
      console.error("Error invoking AutoFirma:", err);
      toast({ title: "Error al invocar AutoFirma", description: "Asegúrate de tener AutoFirma instalada.", variant: "destructive" });
      setSignStatus("idle");
    }
  };

  const handleCompleteSigning = async (file?: File) => {
    if (!selectedDocument || !user) return;
    if (!signerName.trim()) {
      toast({ title: "Falta el firmante", description: "Indica el nombre del firmante.", variant: "destructive" });
      return;
    }
    const signedAt = new Date().toISOString();
    const allowed = await canPerformAction(user.id, selectedDocument.id, "firma");
    if (!allowed) {
      toast({
        title: "Permisos insuficientes",
        description: "Solo el responsable de firma puede firmar este documento.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveDocumentSignature({
      document_id: selectedDocument.id,
      signed_by: user.id,
      signer_name: signerName.trim(),
      signer_email: user.email || null,
      signature_method: "autofirma_dnie",
      signature_data: signReason.trim() || null,
      signed_at: signedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo registrar la firma.";
      toast({ title: "Error al registrar firma", description: message, variant: "destructive" });
      return;
    }
    setSignedDocuments((prev) => ({
      ...prev,
      [selectedDocument.id]: { file, signedAt, signerName: signerName.trim(), reason: signReason.trim() || undefined },
    }));
    setSignStatus("completed");
    toast({ title: "Documento firmado", description: `${selectedDocument.code} ha sido firmado.` });
    fetchFirmaStatus();
  };

  const handleSignedFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleCompleteSigning(file);
  };

  const handleDownloadForSigning = async (doc: Document) => {
    if (doc.fileUrl && !doc.fileUrl.startsWith("/docs/")) {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.fileUrl, 60);
      if (!error && data?.signedUrl) {
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.download = `${doc.code}-para-firmar.${doc.format}`;
        link.target = "_blank";
        link.click();
        return;
      }
    }
    toast({ title: "Sin archivo", description: "Este documento no tiene un archivo asociado.", variant: "destructive" });
  };

  const handleOpenManualSign = (doc: Document) => {
    if (doc.status !== "pending_signature") {
      toast({ title: "No se puede firmar", description: "Solo se pueden firmar documentos en estado 'Pendiente de Firma'.", variant: "destructive" });
      return;
    }
    setSelectedDocument(doc);
    setManualSignName(profile?.full_name || "");
    setManualSignReason("");
    setIsManualSignOpen(true);
  };

  const handleOpenSignatureStatus = (doc: Document) => {
    setSelectedDocument(doc);
    setIsSignatureStatusOpen(true);
  };

  const handleCompleteManualSign = async () => {
    if (!selectedDocument || !user) return;
    if (!manualSignName.trim()) {
      toast({ title: "Nombre requerido", description: "Escribe tu nombre completo para firmar.", variant: "destructive" });
      return;
    }
    const signedAt = new Date().toISOString();
    const allowed = await canPerformAction(user.id, selectedDocument.id, "firma");
    if (!allowed) {
      toast({
        title: "Permisos insuficientes",
        description: "Solo el responsable de firma puede firmar este documento.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveDocumentSignature({
      document_id: selectedDocument.id,
      signed_by: user.id,
      signer_name: manualSignName.trim(),
      signer_email: user.email || null,
      signature_method: "nombre_completo",
      signature_data: manualSignReason.trim() || null,
      signed_at: signedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo registrar la firma.";
      toast({ title: "Error al registrar firma", description: message, variant: "destructive" });
      return;
    }
    setSignedDocuments((prev) => ({
      ...prev,
      [selectedDocument.id]: { signedAt, signerName: manualSignName.trim(), reason: manualSignReason.trim() || undefined },
    }));
    toast({ title: "Documento firmado", description: `${selectedDocument.code} ha sido firmado con nombre completo.` });
    setIsManualSignOpen(false);
    fetchFirmaStatus();
  };

  const getSignatureStatusLabel = (docId: string): { label: string; class: string; icon: typeof PenTool } | null => {
    const fs = firmaStatus[docId];
    if (!fs || fs.total === 0) return null;
    if (fs.signed >= fs.total) return { label: "Firmado", class: "text-success", icon: CheckCircle };
    if (fs.signed > 0) return { label: "Parcialmente firmado", class: "text-warning", icon: Clock };
    return { label: "Pendiente de firma", class: "text-muted-foreground", icon: PenTool };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="documents-search"
            placeholder="Buscar por código, título o responsable..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") onSearchChange(searchQuery); }}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
              onClick={() => onSearchChange("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onOpenFilters} data-testid="documents-filter-button">
            <Filter className="w-4 h-4 mr-2" />
            Filtrar
          </Button>
          <Button data-testid="documents-new-button" variant="accent" onClick={() => onNewDocumentOpenChange(true)} disabled={!canEditContent}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Documento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Categories Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Categorías
            </h3>
            <div className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                    filters.category === cat.id ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <span>{cat.label}</span>
                  <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{cat.count}</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Documents Table */}
        <div className="lg:col-span-3">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/20">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground">Mostrar</Label>
                <Select
                  value={showAllDocuments ? "all" : itemsPerPage.toString()}
                  onValueChange={(value) => {
                    if (value === "all") { setShowAllDocuments(true); setCurrentPage(1); return; }
                    setShowAllDocuments(false); setItemsPerPage(Number(value)); setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">documentos por página</span>
                <Label className="text-xs text-muted-foreground ml-3">Tipología</Label>
                <Select
                  value={filters.documentTypology}
                  onValueChange={(value) => onFiltersChange({ ...filters, documentTypology: value as FiltersState["documentTypology"] })}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {typologyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Título</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipología</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Versión</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actualizado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedDocuments.map((doc) => {
                    const status = statusConfig[doc.status] || defaultStatus;
                    const StatusIcon = status.icon;
                    return (
                      <Fragment key={doc.id}>
                        <tr className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => handleToggleSummary(doc.id)}>
                          <td className="px-4 py-3"><span className="font-mono text-sm text-foreground">{doc.code}</span></td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{doc.title}</p>
                              <p className="text-xs text-muted-foreground">{doc.owner}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs text-foreground">
                              {typologyLabelMap[doc.typology]}
                            </span>
                          </td>
                          <td className="px-4 py-3"><span className="text-sm text-foreground">v{doc.version}</span></td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1.5 text-sm", status.class)}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3"><span className="text-sm text-muted-foreground">{doc.lastUpdated}</span></td>
                          <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                            <DocumentActionsMenu
                              documentId={doc.id}
                              isLocked={false}
                              onView={() => handleOpenPreview(doc)}
                              onEdit={() => handleOpenEdit(doc)}
                              onViewHistory={() => handleOpenHistory(doc)}
                              onViewOwners={() => handleOpenOwners(doc)}
                              onDownload={() => handleDownload(doc)}
                               onSign={() => handleOpenSign(doc)}
                               onSignManual={() => handleOpenManualSign(doc)}
                              onViewSignatureStatus={() => handleOpenSignatureStatus(doc)}
                               onChangeStatus={() => handleOpenChangeStatus(doc)}
                              onManageResponsibilities={() => { setSelectedDocument(doc); setIsResponsibilitiesOpen(true); }}
                              onViewPendingActions={() => { setSelectedDocument(doc); setIsPendingActionsOpen(true); }}
                              onShare={() => handleAction("Compartir", doc.code)}
                              onToggleLock={() => handleAction("Bloquear/Desbloquear", doc.code)}
                              onDelete={() => handleRequestDelete(doc)}
                            />
                          </td>
                        </tr>
                        {expandedDocumentId === doc.id && (
                          <tr className="bg-secondary/20">
                            <td colSpan={7} className="px-4 py-4">
                              <div className="space-y-4">
                                {/* Metadata */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Formato</p><p className="font-medium text-foreground">{doc.format.toUpperCase()}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Autor original</p><p className="font-medium text-foreground">{doc.originalAuthor}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Versión actual</p><p className="font-medium text-foreground">v{doc.version}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Última modificación</p><p className="font-medium text-foreground">{doc.lastUpdated}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Modificado por</p><p className="font-medium text-foreground">{doc.lastModifiedBy}</p></div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="outline" onClick={() => handleOpenPreview(doc)}>Ver documento</Button>
                                  <Button variant="outline" onClick={() => handleOpenUpdateVersion(doc)} disabled={!canEditContent}>Actualizar versión</Button>
                                  <Button variant="outline" onClick={() => { setSelectedDocument(doc); setIsPendingActionsOpen(true); }}>
                                    <ClipboardList className="w-4 h-4 mr-1" />
                                    Acciones Pendientes
                                  </Button>
                                  <Button variant="accent" onClick={() => handleDownload(doc)}>Descargar</Button>
                                </div>

                                {/* Responsibilities */}
                                {expandedResponsibilities[doc.id] && expandedResponsibilities[doc.id].length > 0 && (
                                  <div className="border-t border-border pt-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Responsables asignados</p>
                                    <div className="space-y-1.5">
                                      {expandedResponsibilities[doc.id].map((r, idx) => {
                                        const actionLabel = r.action_type === "revision" ? "Revisión" : r.action_type === "firma" ? "Firma" : r.action_type === "aprobacion" ? "Aprobación" : r.action_type;
                                        const isOverdue = new Date(r.due_date) < new Date() && r.status !== "completed";
                                        const isCompleted = r.status === "completed";
                                        return (
                                          <div key={idx} className="flex items-center gap-3 text-sm">
                                            <span className="font-medium text-foreground w-24 shrink-0">{actionLabel}</span>
                                            <span className="text-muted-foreground">{r.userName}</span>
                                            <span className={cn(
                                              "ml-auto shrink-0 text-xs",
                                              isCompleted ? "text-success font-medium" : isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                                            )}>
                                              {isCompleted ? "✓ Completado" : `Límite: ${new Date(r.due_date).toLocaleDateString("es-ES")}`}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredDocuments.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">No se encontraron resultados para “{searchQuery}”.</div>
            )}

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-border bg-secondary/20">
              <p className="text-sm text-muted-foreground">
                Mostrando {startItem}-{Math.min(currentPage * effectiveItemsPerPage, filteredDocuments.length)} de {filteredDocuments.length} documentos
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>Siguiente</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Dialog — shows document summary info, with real PDF embed if applicable */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle del documento</DialogTitle>
            <DialogDescription>Información y descarga del archivo.</DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground text-base">{selectedDocument.title}</p>
                  <p>Código: {selectedDocument.code}</p>
                  <p>Formato: {selectedDocument.format.toUpperCase()}</p>
                  <p>Categoría: {selectedDocument.category}</p>
                  <p>Tipología: {typologyLabelMap[selectedDocument.typology]}</p>
                </div>
                <div>
                  <p>Autor: {selectedDocument.originalAuthor}</p>
                  <p>Versión: v{selectedDocument.version}</p>
                  <p>Última modificación: {selectedDocument.lastUpdated}</p>
                </div>
              </div>

              {/* Real PDF embed */}
              {selectedDocument.format === "pdf" && selectedDocument.fileUrl && !selectedDocument.fileUrl.startsWith("/docs/") && (
                <PdfEmbed fileUrl={selectedDocument.fileUrl} />
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Cerrar</Button>
            {selectedDocument && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => handleOpenUpdateVersion(selectedDocument)} disabled={!canEditContent}>Actualizar versión</Button>
                <Button variant="accent" onClick={() => handleDownload(selectedDocument)}>Descargar</Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (isDeletingDocument) return;
          setIsDeleteConfirmOpen(open);
          if (!open) setDocumentToDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar documento</DialogTitle>
            <DialogDescription>
              Esta acción eliminará el documento y todos sus registros asociados de forma permanente.
            </DialogDescription>
          </DialogHeader>
          {deleteLinkedInfo.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
              <p className="text-sm font-medium text-destructive">⚠️ Este documento está vinculado a:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
                {deleteLinkedInfo.map((info, i) => (
                  <li key={i}>{info}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">Todos estos registros serán eliminados junto con el documento.</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            ¿Seguro que deseas eliminar <span className="font-semibold text-foreground">{documentToDelete?.code}</span>?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isDeletingDocument) return;
                setIsDeleteConfirmOpen(false);
                setDocumentToDelete(null);
              }}
              disabled={isDeletingDocument}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeletingDocument}>
              {isDeletingDocument ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign Dialog */}
      <Dialog open={isSignOpen} onOpenChange={setIsSignOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Firma electrónica con DNIe</DialogTitle>
            <DialogDescription>Firma electrónica cualificada integrada con el DNIe y AutoFirma.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Documento seleccionado</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div><p className="font-medium text-foreground">{selectedDocument?.title ?? "Documento"}</p><p>Código: {selectedDocument?.code ?? "N/D"}</p></div>
                <div><p>Versión: v{selectedDocument?.version ?? "N/D"}</p><p>Responsable: {selectedDocument?.owner ?? "N/D"}</p></div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre del firmante</Label>
                <Input placeholder="Nombre y apellidos" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Documento firmado (salida AutoFirma)</Label>
                <Input type="file" accept=".pdf,.docx,.xlsx" onChange={handleSignedFileChange} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Motivo / comentario de firma</Label>
              <Textarea placeholder="Añade el motivo de la firma (opcional)" rows={3} value={signReason} onChange={(e) => setSignReason(e.target.value)} />
            </div>
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Estado de la firma</p>
              {signStatus === "idle" && <p>Haz clic en "Iniciar firma con DNIe" para invocar AutoFirma.</p>}
              {signStatus === "waiting" && <p>AutoFirma invocada. Sube el archivo firmado o haz clic en "Confirmar firma".</p>}
              {signStatus === "completed" && (
                <div className="space-y-1 text-success">
                  <p>Firma completada.</p>
                  {selectedDocument && signedDocuments[selectedDocument.id] && (
                    <p className="text-xs text-muted-foreground">Firmado por {signedDocuments[selectedDocument.id].signerName} el {new Date(signedDocuments[selectedDocument.id].signedAt).toLocaleString("es-ES")}.</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsSignOpen(false)}>Cerrar</Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => selectedDocument && handleDownloadForSigning(selectedDocument)} disabled={!selectedDocument || signStatus === "completed"}>Descargar para firmar</Button>
              <Button variant="accent" onClick={handleStartSigning} disabled={signStatus !== "idle"}>Iniciar firma con DNIe</Button>
              {signStatus === "waiting" && <Button variant="default" onClick={() => handleCompleteSigning()} disabled={!signerName.trim()}>Confirmar firma</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Sign Dialog */}
      <Dialog open={isManualSignOpen} onOpenChange={setIsManualSignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Firmar con nombre completo</DialogTitle>
            <DialogDescription>Firma el documento escribiendo tu nombre completo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Documento seleccionado</p>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{selectedDocument?.title ?? "Documento"}</p>
                <p>Código: {selectedDocument?.code ?? "N/D"} · Versión: v{selectedDocument?.version ?? "N/D"}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre completo del firmante *</Label>
              <Input
                placeholder="Escribe tu nombre y apellidos completos"
                value={manualSignName}
                onChange={(e) => setManualSignName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Al escribir tu nombre completo confirmas que aceptas firmar este documento.</p>
            </div>
            <div className="space-y-2">
              <Label>Motivo / comentario (opcional)</Label>
              <Textarea
                placeholder="Añade el motivo de la firma"
                rows={2}
                value={manualSignReason}
                onChange={(e) => setManualSignReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManualSignOpen(false)}>Cancelar</Button>
            <Button onClick={handleCompleteManualSign} disabled={!manualSignName.trim()}>Firmar documento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Document Dialog */}
      <Dialog open={isNewDocumentOpen} onOpenChange={onNewDocumentOpenChange}>
        <DialogContent className="sm:max-w-3xl" data-testid="new-document-modal">
          <DialogHeader>
            <DialogTitle>Nuevo documento</DialogTitle>
            <DialogDescription>Carga un documento individual o realiza una carga masiva.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="single">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="single">Documento individual</TabsTrigger>
              <TabsTrigger value="batch">Carga masiva</TabsTrigger>
            </TabsList>
            <TabsContent value="single" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input data-testid="document-code-input" placeholder="PNT-XXX-000" value={newDocCode} onChange={(e) => setNewDocCode(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input data-testid="document-title-input" placeholder="Nombre del documento" value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Área / Categoría</Label>
                  <Select value={newDocCategory} onValueChange={setNewDocCategory}>
                    <SelectTrigger data-testid="document-category-select"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calidad">Calidad</SelectItem>
                      <SelectItem value="produccion">Producción</SelectItem>
                      <SelectItem value="logistica">Logística</SelectItem>
                      <SelectItem value="rrhh">RRHH</SelectItem>
                      <SelectItem value="regulatory">Regulatory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipología</Label>
                  <Select value={newDocTypology} onValueChange={(value) => setNewDocTypology(value as DocumentTypology)}>
                    <SelectTrigger data-testid="document-typology-select"><SelectValue placeholder="Selecciona una tipología" /></SelectTrigger>
                    <SelectContent>
                      {typologyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descripción / alcance</Label>
                <Textarea placeholder="Describe el alcance del documento..." rows={3} value={newDocDescription} onChange={(e) => setNewDocDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Archivo</Label>
                <Input data-testid="document-file-input" type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.webp" onChange={(e) => setNewDocFile(e.target.files?.[0] || null)} />
              </div>

              {/* Responsables inline */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-accent" />
                  <Label className="font-medium">Responsables</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Select value={newRespUserId} onValueChange={setNewRespUserId}>
                    <SelectTrigger><SelectValue placeholder="Usuario..." /></SelectTrigger>
                    <SelectContent>
                      {companyUsers.map(u => (
                        <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newRespAction} onValueChange={setNewRespAction}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="firma">Firma</SelectItem>
                      <SelectItem value="aprobacion">Aprobación</SelectItem>
                      <SelectItem value="revision">Revisión</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input type="date" value={newRespDueDate} onChange={e => setNewRespDueDate(e.target.value)} className="flex-1" />
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      if (!newRespUserId || !newRespDueDate) return;
                      setNewDocResponsibilities(prev => [...prev, { userId: newRespUserId, actionType: newRespAction, dueDate: newRespDueDate }]);
                      setNewRespUserId("");
                      setNewRespDueDate("");
                    }} disabled={!newRespUserId || !newRespDueDate}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {newDocResponsibilities.length > 0 && (
                  <div className="space-y-1.5">
                    {newDocResponsibilities.map((r, i) => {
                      const userName = companyUsers.find(u => u.user_id === r.userId);
                      const actionLabel = r.actionType === "firma" ? "Firma" : r.actionType === "aprobacion" ? "Aprobación" : "Revisión";
                      return (
                        <div key={i} className="flex items-center justify-between text-sm border border-border rounded px-3 py-1.5">
                          <span className="text-foreground">{userName?.full_name || userName?.email || r.userId} — <span className="text-muted-foreground">{actionLabel}</span> — <span className="text-muted-foreground">{r.dueDate}</span></span>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setNewDocResponsibilities(prev => prev.filter((_, idx) => idx !== i))}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="batch" className="space-y-4 mt-4">
              <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <UploadCloud className="w-5 h-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Carga masiva con Excel</p>
                    <p className="text-xs text-muted-foreground">Sube el archivo de mapeo para asociar metadatos.</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <Input type="file" accept=".xlsx,.xls" />
                  <Button variant="outline">Descargar plantilla</Button>
                </div>
              </div>
              <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Carga por carpeta</p>
                    <p className="text-xs text-muted-foreground">Arrastra o selecciona una carpeta completa.</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <Input ref={folderInputRef} type="file" multiple />
                  <Button variant="outline">Verificar estructura</Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => onNewDocumentOpenChange(false)}>Cancelar</Button>
            <Button variant="accent" disabled={isUploading || !canEditContent} onClick={handleUploadDocument} data-testid="document-save-button">
              {isUploading ? "Subiendo..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar documento</DialogTitle>
            <DialogDescription>Modifica los datos del documento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código</Label>
                <Input value={editDocCode} onChange={(e) => setEditDocCode(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={editDocTitle} onChange={(e) => setEditDocTitle(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={editDocCategory} onValueChange={setEditDocCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calidad">Calidad</SelectItem>
                    <SelectItem value="produccion">Producción</SelectItem>
                    <SelectItem value="logistica">Logística</SelectItem>
                    <SelectItem value="rrhh">RRHH</SelectItem>
                    <SelectItem value="regulatory">Regulatory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipología</Label>
                <Select value={editDocTypology} onValueChange={(value) => setEditDocTypology(value as DocumentTypology)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {typologyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={editDocStatus} onValueChange={setEditDocStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="review">En Revisión</SelectItem>
                    <SelectItem value="approved">Aprobado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button variant="accent" onClick={handleSaveEdit} disabled={isEditSaving}>{isEditSaving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Version Dialog */}
      <Dialog open={isUpdateVersionOpen} onOpenChange={setIsUpdateVersionOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Actualizar versión</DialogTitle>
            <DialogDescription>
              Sube un nuevo archivo para {selectedDocument?.code}. La versión actual (v{selectedDocument?.version}) se guardará en el historial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo archivo</Label>
              <Input type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.webp" onChange={(e) => setUpdateVersionFile(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-2">
              <Label>Descripción de cambios</Label>
              <Textarea placeholder="Describe los cambios realizados..." rows={3} value={updateVersionChanges} onChange={(e) => setUpdateVersionChanges(e.target.value)} />
            </div>

            <div className="space-y-3 border border-border rounded-lg p-4 bg-secondary/10">
              <p className="text-sm font-medium text-foreground">Responsables de la nueva versión</p>
              <p className="text-xs text-muted-foreground">Se cargan automáticamente desde la versión actual, pero puedes editarlos antes de guardar.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Usuario</Label>
                  <Select value={updateRespUserId} onValueChange={setUpdateRespUserId}>
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
                  <Select value={updateRespAction} onValueChange={setUpdateRespAction}>
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
                  <Input type="date" value={updateRespDueDate} onChange={(e) => setUpdateRespDueDate(e.target.value)} />
                </div>
              </div>

              <Button size="sm" type="button" onClick={handleAddUpdateResponsibility}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Añadir responsable
              </Button>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {updateVersionResponsibilities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay responsables asignados.</p>
                ) : (
                  updateVersionResponsibilities.map((responsibility, index) => {
                    const userLabel = companyUsers.find((u) => u.user_id === responsibility.userId);
                    return (
                      <div key={`${responsibility.userId}-${responsibility.actionType}-${index}`} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                        <div className="text-xs text-foreground">
                          {(userLabel?.full_name || userLabel?.email || responsibility.userId)} · {responsibility.actionType} · {responsibility.dueDate}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleRemoveUpdateResponsibility(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateVersionOpen(false)}>Cancelar</Button>
            <Button variant="accent" onClick={handleUpdateVersion} disabled={isUpdatingVersion || !updateVersionFile || updateVersionResponsibilities.length === 0}>
              {isUpdatingVersion ? "Actualizando..." : "Actualizar versión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Historial de versiones</DialogTitle>
            <DialogDescription>Versiones anteriores de {selectedDocument?.code ?? "el documento"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {/* Current version */}
            {selectedDocument && (() => {
              // The latest version history entry contains the changes_description for the current version
              const latestHistoryEntry = versionHistory.length > 0 ? versionHistory[0] : null;
              const currentChanges = latestHistoryEntry?.changes_description;
              const prevVersion = latestHistoryEntry?.version;
              return (
                <div className="border border-primary/30 bg-primary/5 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">v{selectedDocument.version} (actual)</p>
                    <Button variant="outline" size="sm" onClick={() => handleDownload(selectedDocument)}>
                      <Download className="w-3 h-3 mr-1" />Descargar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Última actualización: {selectedDocument.lastUpdated}</p>
                  {currentChanges && prevVersion && (
                    <p className="text-xs mt-1 text-muted-foreground">Cambios respecto v{prevVersion}.0: {currentChanges}</p>
                  )}
                </div>
              );
            })()}
            {isLoadingHistory && <p className="text-center py-4">Cargando historial...</p>}
            {!isLoadingHistory && versionHistory.length === 0 && <p className="text-center py-4">No hay versiones anteriores registradas.</p>}
            {versionHistory.map((v, index) => {
              // Each version shows the changes_description from the next older version (index+1)
              const olderEntry = index + 1 < versionHistory.length ? versionHistory[index + 1] : null;
              const changes = olderEntry?.changes_description;
              const olderVersion = olderEntry?.version;
              return (
                <div key={v.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">v{v.version}.0</p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleDownloadVersion(v.file_url, v.version, selectedDocument?.code || "doc")}>
                        <Download className="w-3 h-3 mr-1" />Descargar
                      </Button>
                      {isSuperadmin && (
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteVersion(v.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs mt-1">Por {v.creatorName} el {new Date(v.created_at).toLocaleDateString("es-ES")}</p>
                  {changes && olderVersion != null && (
                    <p className="text-xs mt-1 text-muted-foreground">Cambios respecto v{olderVersion}.0: {changes}</p>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owners Dialog */}
      <Dialog open={isOwnersOpen} onOpenChange={setIsOwnersOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Propietarios del documento</DialogTitle>
            <DialogDescription>Responsables y aprobadores asignados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between border border-border rounded-lg p-3">
              <div>
                <p className="font-medium text-foreground">{selectedDocument?.owner ?? "—"}</p>
                <p>Propietario principal</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOwnersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Status Dialog */}
      <Dialog open={isChangeStatusOpen} onOpenChange={setIsChangeStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar estado del documento</DialogTitle>
            <DialogDescription>
              Selecciona el nuevo estado para {selectedDocument?.code ?? "el documento"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Estado actual</Label>
              <p className="text-sm font-medium text-foreground">
                {selectedDocument ? (statusConfig[selectedDocument.status]?.label ?? selectedDocument.status) : "—"}
              </p>
            </div>

            {/* Workflow guidance */}
            <div className="border border-border rounded-lg p-3 bg-secondary/10 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">Flujo de aprobación</p>
              <p>1. <strong>Borrador</strong> → En Revisión (se asignan revisores)</p>
              <p>2. <strong>En Revisión</strong> → Pendiente de Firma (automático: cuando todos los revisores completan)</p>
              <p>3. <strong>Pendiente de Firma</strong> → Pendiente de Aprobación (automático: cuando todos firman)</p>
              <p>4. <strong>Pendiente de Aprobación</strong> → Aprobado (el responsable de aprobación aprueba)</p>
            </div>

            <div className="space-y-2">
              <Label>Nuevo estado</Label>
              <Select value={changeStatusTarget} onValueChange={setChangeStatusTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions
                    .filter(opt => {
                      if (!selectedDocument) return false;
                      const cs = selectedDocument.status;
                      // Only show valid transitions for the current status
                      if (cs === "draft") return opt.value === "draft" || opt.value === "review";
                      if (cs === "review") return opt.value === "review"; // pending_signature is automatic
                      if (cs === "pending_signature") return opt.value === "pending_signature"; // pending_approval is automatic
                      if (cs === "pending_approval") return opt.value === "pending_approval" || opt.value === "approved";
                      return opt.value === cs;
                    })
                    .map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comentario (opcional)</Label>
              <Textarea
                placeholder="Motivo del cambio de estado..."
                rows={3}
                value={changeStatusComment}
                onChange={(e) => setChangeStatusComment(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => { if (selectedDocument) handleOpenStatusHistory(selectedDocument); }}>
              <ArrowRightLeft className="w-3.5 h-3.5 mr-2" />
              Ver historial de estados
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsChangeStatusOpen(false)}>Cancelar</Button>
            <Button
              variant="accent"
              onClick={handleChangeStatus}
              disabled={isChangingStatus || changeStatusTarget === selectedDocument?.status}
            >
              {isChangingStatus ? "Guardando..." : "Cambiar estado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status History Dialog */}
      <Dialog open={isStatusHistoryOpen} onOpenChange={setIsStatusHistoryOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Historial de estados</DialogTitle>
            <DialogDescription>
              Cambios de estado de {selectedDocument?.code ?? "el documento"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm max-h-96 overflow-y-auto">
            {isLoadingStatusHistory && <p className="text-center py-4 text-muted-foreground">Cargando historial...</p>}
            {!isLoadingStatusHistory && statusHistory.length === 0 && (
              <p className="text-center py-4 text-muted-foreground">No hay cambios de estado registrados.</p>
            )}
            {statusHistory.map((entry) => {
              const oldLabel = entry.old_status ? (statusConfig[entry.old_status as keyof typeof statusConfig]?.label ?? entry.old_status) : "—";
              const newLabel = statusConfig[entry.new_status as keyof typeof statusConfig]?.label ?? entry.new_status;
              return (
                <div key={entry.id} className="border border-border rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{oldLabel}</span>
                    <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground">{newLabel}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Por {entry.changerName} el {new Date(entry.changed_at).toLocaleString("es-ES")}
                  </p>
                  {entry.comment && <p className="text-xs text-muted-foreground">Comentario: {entry.comment}</p>}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusHistoryOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentSignatureStatusDialog
        open={isSignatureStatusOpen}
        onOpenChange={setIsSignatureStatusOpen}
        documentId={selectedDocument?.id ?? null}
        documentCode={selectedDocument?.code}
      />
      {/* Responsibilities Dialog */}
      {selectedDocument && (
        <DocumentResponsibilities
          documentId={selectedDocument.id}
          documentCode={selectedDocument.code}
          open={isResponsibilitiesOpen}
          onOpenChange={setIsResponsibilitiesOpen}
          onWorkflowChange={() => { fetchDocuments(); fetchFirmaStatus(); }}
        />
      )}
      {/* Pending Actions Dialog */}
      {selectedDocument && (
        <Dialog open={isPendingActionsOpen} onOpenChange={setIsPendingActionsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Acciones Pendientes
              </DialogTitle>
              <DialogDescription>
                Acciones pendientes para {selectedDocument.code}
              </DialogDescription>
            </DialogHeader>
            <DocumentPendingActions
              documentId={selectedDocument.id}
              onActionCompleted={() => { fetchDocuments(); fetchFirmaStatus(); }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPendingActionsOpen(false)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Embeds a real PDF using a signed URL from storage */
function PdfEmbed({ fileUrl }: { fileUrl: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(fileUrl, 300);
      if (!cancelled) {
        setSignedUrl(!error && data?.signedUrl ? data.signedUrl : null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Cargando vista previa...</p>;
  if (!signedUrl) return <p className="text-sm text-muted-foreground text-center py-4">No se pudo cargar la vista previa del PDF.</p>;

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">
      <iframe src={signedUrl} className="w-full h-[500px]" title="Vista previa PDF" />
    </div>
  );
}
