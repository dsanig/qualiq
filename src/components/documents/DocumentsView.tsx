import { Fragment, useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  Filter,
  Plus,
  FolderOpen,
  CheckCircle,
  Clock,
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

interface Document {
  id: string;
  code: string;
  title: string;
  category: string;
  categoryId: string;
  version: string;
  versionNum: number;
  status: "approved" | "draft" | "review" | "obsolete";
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

const statusConfig = {
  approved: { label: "Aprobado", icon: CheckCircle, class: "text-success" },
  draft: { label: "Borrador", icon: Clock, class: "text-muted-foreground" },
  review: { label: "En Revisión", icon: AlertCircle, class: "text-warning" },
  obsolete: { label: "Obsoleto", icon: AlertCircle, class: "text-destructive" },
};

const statusOptions = [
  { value: "draft", label: "Borrador" },
  { value: "review", label: "En Revisión" },
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
  mode?: "documents" | "processes";
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
  onOpenFilters: () => void;
  isNewDocumentOpen: boolean;
  onNewDocumentOpenChange: (open: boolean) => void;
}

export function DocumentsView({
  mode = "documents",
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  onOpenFilters,
  isNewDocumentOpen,
  onNewDocumentOpenChange,
}: DocumentsViewProps) {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showAllDocuments, setShowAllDocuments] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
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
  const { canEditContent, isSuperadmin, refreshPermissions } = usePermissions();

  // Edit document state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editDocCode, setEditDocCode] = useState("");
  const [editDocTitle, setEditDocTitle] = useState("");
  const [editDocCategory, setEditDocCategory] = useState("calidad");
  const [editDocStatus, setEditDocStatus] = useState("draft");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

  // Update version state
  const [isUpdateVersionOpen, setIsUpdateVersionOpen] = useState(false);
  const [updateVersionFile, setUpdateVersionFile] = useState<File | null>(null);
  const [updateVersionChanges, setUpdateVersionChanges] = useState("");
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
  // New document form state
  const [newDocCode, setNewDocCode] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocCategory, setNewDocCategory] = useState("calidad");
  const [newDocDescription, setNewDocDescription] = useState("");
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Inline responsibilities for new document
  interface InlineResponsibility {
    userId: string;
    actionType: string;
    dueDate: string;
  }
  const [newDocResponsibilities, setNewDocResponsibilities] = useState<InlineResponsibility[]>([]);
  const [newRespUserId, setNewRespUserId] = useState("");
  const [newRespAction, setNewRespAction] = useState("revision");
  const [newRespDueDate, setNewRespDueDate] = useState("");
  const [companyUsers, setCompanyUsers] = useState<{ user_id: string; full_name: string | null; email: string }[]>([]);

   // Real documents from database
  const [dbDocuments, setDbDocuments] = useState<Document[]>([]);

  // Signature status per document: { docId: { totalSigners, signedCount } }
  const [firmaStatus, setFirmaStatus] = useState<Record<string, { total: number; signed: number }>>({});

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
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false });
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
  }, [profile?.company_id]);

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
  }, [fetchDocuments, fetchSignatures, fetchCompanyUsers, fetchFirmaStatus]);

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
    setEditDocStatus(doc.status);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDocId) return;
    setIsEditSaving(true);
    try {
      const { error } = await supabase.from("documents").update({
        code: editDocCode.trim(),
        title: editDocTitle.trim(),
        category: editDocCategory.charAt(0).toUpperCase() + editDocCategory.slice(1),
        status: editDocStatus as any,
      }).eq("id", editingDocId);
      if (error) throw error;
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

      const statusLabel = statusOptions.find(s => s.value === changeStatusTarget)?.label || changeStatusTarget;
      toast({ title: "Estado actualizado", description: `El documento ahora está en "${statusLabel}".` });
      setIsChangeStatusOpen(false);
      fetchDocuments();
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
  const handleOpenUpdateVersion = (doc: Document) => {
    setSelectedDocument(doc);
    setUpdateVersionFile(null);
    setUpdateVersionChanges("");
    setIsUpdateVersionOpen(true);
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

      // Save current version to history
      await (supabase as any).from("document_versions").insert({
        document_id: selectedDocument.id,
        version: selectedDocument.versionNum,
        file_url: selectedDocument.fileUrl,
        changes_description: updateVersionChanges.trim() || null,
        created_by: user.id,
      });

      // Update document with new version
      const { error: updateError } = await supabase.from("documents").update({
        version: newVersion,
        file_url: filePath,
        file_type: fileType,
      }).eq("id", selectedDocument.id);
      if (updateError) throw updateError;

      toast({ title: "Versión actualizada", description: `El documento ahora está en v${newVersion}.0` });
      setIsUpdateVersionOpen(false);
      fetchDocuments();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsUpdatingVersion(false);
    }
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

      if (fileType === "other") {
        throw new Error("Formato no permitido. Usa PDF, Word, Excel o imagen (PNG/JPG/JPEG/WEBP).");
      }

      const documentId = crypto.randomUUID();
      const filePath = `${profile.company_id}/${documentId}/${newDocFile.name}`;

      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, newDocFile);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("documents").insert({
        id: documentId,
        code: newDocCode.trim(),
        title: newDocTitle.trim(),
        category: newDocCategory.charAt(0).toUpperCase() + newDocCategory.slice(1),
        company_id: profile.company_id,
        owner_id: uploaderUser.id,
        file_type: fileType,
        file_url: filePath,
        status: "draft" as const,
      });
      if (insertError) throw insertError;

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
        doc.description,
        doc.version,
        doc.originalAuthor,
        doc.lastModifiedBy,
        doc.fileUrl,
      );

      const matchesCategory = filters.category === "all" || doc.categoryId === filters.category;
      const matchesStatus = filters.documentStatus === "all" || doc.status === filters.documentStatus;
      
      const isSigned = !!signedDocuments[doc.id];
      const matchesSignature =
        filters.signatureStatus === "all" ||
        (filters.signatureStatus === "signed" && isSigned) ||
        (filters.signatureStatus === "pending" && !isSigned && doc.status === "approved") ||
        (filters.signatureStatus === "not_required" && doc.status !== "approved");

      return matchesQuery && matchesCategory && matchesStatus && matchesSignature;
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

  const handleOpenPreview = (doc: Document) => {
    setSelectedDocument(doc);
    setIsPreviewOpen(true);
  };

  const handleToggleSummary = (docId: string) => {
    setExpandedDocumentId((prev) => (prev === docId ? null : docId));
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
    setSelectedDocument(doc);
    const existingSignature = signedDocuments[doc.id];
    setSignStatus(existingSignature ? "completed" : "idle");
    setSignReason(existingSignature?.reason ?? "");
    setSignerName(existingSignature?.signerName ?? "");
    setIsSignOpen(true);
  };

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
    const { error } = await supabase.from("document_signatures").upsert({
      document_id: selectedDocument.id,
      signed_by: user.id,
      signer_name: signerName.trim(),
      signer_email: user.email || null,
      signature_method: "autofirma_dnie",
      signature_data: signReason.trim() || null,
      signed_at: signedAt,
    }, { onConflict: "document_id,signed_by" });
    if (error) {
      toast({ title: "Error al registrar firma", description: error.message, variant: "destructive" });
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
    const { error } = await supabase.from("document_signatures").upsert({
      document_id: selectedDocument.id,
      signed_by: user.id,
      signer_name: manualSignName.trim(),
      signer_email: user.email || null,
      signature_method: "nombre_completo",
      signature_data: manualSignReason.trim() || null,
      signed_at: signedAt,
    }, { onConflict: "document_id,signed_by" });
    if (error) {
      toast({ title: "Error al registrar firma", description: error.message, variant: "destructive" });
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
            placeholder={mode === "processes" ? "Buscar procesos por código, título o responsable..." : "Buscar por código, título o responsable..."}
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
              </div>
              <span className="text-xs text-muted-foreground">{selectedIds.length} seleccionados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <Checkbox checked={paginatedDocuments.length > 0 && selectedIds.length === paginatedDocuments.length} onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))} aria-label="Seleccionar todos" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Título</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Versión</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Firma</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actualizado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedDocuments.map((doc) => {
                    const status = statusConfig[doc.status];
                    const StatusIcon = status.icon;
                    return (
                      <Fragment key={doc.id}>
                        <tr className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => handleToggleSummary(doc.id)}>
                          <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                            <Checkbox checked={selectedIds.includes(doc.id)} onCheckedChange={(checked) => toggleSelect(doc.id, Boolean(checked))} aria-label={`Seleccionar ${doc.code}`} />
                          </td>
                          <td className="px-4 py-3"><span className="font-mono text-sm text-foreground">{doc.code}</span></td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{doc.title}</p>
                              <p className="text-xs text-muted-foreground">{doc.owner}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className="text-sm text-foreground">v{doc.version}</span></td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1.5 text-sm", status.class)}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const sigStatus = getSignatureStatusLabel(doc.id);
                              if (!sigStatus) return <span className="text-xs text-muted-foreground">—</span>;
                              const SigIcon = sigStatus.icon;
                              return (
                                <span className={cn("inline-flex items-center gap-1.5 text-sm", sigStatus.class)}>
                                  <SigIcon className="w-3.5 h-3.5" />
                                  {sigStatus.label}
                                </span>
                              );
                            })()}
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
                              onShare={() => handleAction("Compartir", doc.code)}
                              onArchive={() => handleAction("Archivar", doc.code)}
                              onToggleLock={() => handleAction("Bloquear/Desbloquear", doc.code)}
                              onDelete={() => handleAction("Eliminar", doc.code)}
                            />
                          </td>
                        </tr>
                        {expandedDocumentId === doc.id && (
                          <tr className="bg-secondary/20">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-muted-foreground">
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Formato</p><p className="text-sm font-medium text-foreground">{doc.format.toUpperCase()}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Autor original</p><p className="text-sm font-medium text-foreground">{doc.originalAuthor}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Versión actual</p><p className="text-sm font-medium text-foreground">v{doc.version}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Última modificación</p><p className="text-sm font-medium text-foreground">{doc.lastUpdated}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Modificado por</p><p className="text-sm font-medium text-foreground">{doc.lastModifiedBy}</p></div>
                                  <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Firma</p><p className="text-sm font-medium text-foreground">{getSignatureStatusLabel(doc.id)?.label ?? "Sin responsables"}</p></div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="outline" onClick={() => handleOpenPreview(doc)}>Ver documento</Button>
                                  <Button variant="outline" onClick={() => handleOpenUpdateVersion(doc)} disabled={!canEditContent}>Actualizar versión</Button>
                                  <Button variant="accent" onClick={() => handleDownload(doc)}>Descargar</Button>
                                </div>
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
                </div>
                <div>
                  <p>Autor: {selectedDocument.originalAuthor}</p>
                  <p>Versión: v{selectedDocument.version}</p>
                  <p>Última modificación: {selectedDocument.lastUpdated}</p>
                  <p>Firma: {signedDocuments[selectedDocument.id] ? "Firmado con DNIe" : "Pendiente"}</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateVersionOpen(false)}>Cancelar</Button>
            <Button variant="accent" onClick={handleUpdateVersion} disabled={isUpdatingVersion || !updateVersionFile}>
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
            {selectedDocument && (
              <div className="border border-primary/30 bg-primary/5 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">v{selectedDocument.version} (actual)</p>
                  <Button variant="outline" size="sm" onClick={() => handleDownload(selectedDocument)}>
                    <Download className="w-3 h-3 mr-1" />Descargar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Última actualización: {selectedDocument.lastUpdated}</p>
              </div>
            )}
            {isLoadingHistory && <p className="text-center py-4">Cargando historial...</p>}
            {!isLoadingHistory && versionHistory.length === 0 && <p className="text-center py-4">No hay versiones anteriores registradas.</p>}
            {versionHistory.map((v) => (
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
                {v.changes_description && <p className="text-xs mt-1">Cambios: {v.changes_description}</p>}
              </div>
            ))}
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
            <div className="space-y-2">
              <Label>Nuevo estado</Label>
              <Select value={changeStatusTarget} onValueChange={setChangeStatusTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
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
        />
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
