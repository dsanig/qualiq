import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface SignatureStatusUser {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  isSigned: boolean;
  signedAt?: string;
  method?: string;
  metadata?: string | null;
  isResponsible: boolean;
}

interface DocumentSignatureStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  documentCode?: string;
}

const formatMethod = (method?: string) => {
  if (!method) return "—";
  if (method === "autofirma_dnie") return "DNIe";
  if (method === "nombre_completo") return "Nombre";
  return method;
};

export function DocumentSignatureStatusDialog({
  open,
  onOpenChange,
  documentId,
  documentCode,
}: DocumentSignatureStatusDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showOnlyResponsibilities, setShowOnlyResponsibilities] = useState(false);
  const [users, setUsers] = useState<SignatureStatusUser[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!open || !documentId) return;
      setIsLoading(true);

      const profilesQuery = supabase.from("profiles").select("user_id, full_name, email");
      // Fall back to all visible profiles if there is no company_id available in the local profile.
      const { data: profilesData, error: profilesError } = profile?.company_id
        ? await profilesQuery.eq("company_id", profile.company_id)
        : await profilesQuery;

      if (profilesError) {
        toast({ title: "Error", description: profilesError.message, variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const { data: responsibilitiesData } = await supabase
        .from("document_responsibilities")
        .select("user_id, action_type")
        .eq("document_id", documentId);

      const { data: signaturesData, error: signaturesError } = await supabase
        .from("document_signatures")
        .select("signed_by, signed_at, signature_method, signature_data")
        .eq("document_id", documentId)
        .order("signed_at", { ascending: false });

      if (signaturesError) {
        toast({ title: "Error", description: signaturesError.message, variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const roleMap = new Map<string, string[]>();
      (roleRows || []).forEach((row) => {
        const current = roleMap.get(row.user_id) || [];
        current.push(row.role);
        roleMap.set(row.user_id, current);
      });

      const responsibleIds = new Set(
        (responsibilitiesData || [])
          .filter((row) => row.action_type === "firma")
          .map((row) => row.user_id)
      );

      const signaturesByUser = new Map<string, { signedAt: string; method: string; metadata: string | null }>();
      for (const signature of signaturesData || []) {
        if (!signaturesByUser.has(signature.signed_by)) {
          signaturesByUser.set(signature.signed_by, {
            signedAt: signature.signed_at,
            method: signature.signature_method,
            metadata: signature.signature_data,
          });
        }
      }

      const merged: SignatureStatusUser[] = (profilesData || []).map((row) => {
        const signature = signaturesByUser.get(row.user_id);
        return {
          userId: row.user_id,
          fullName: row.full_name || "Sin nombre",
          email: row.email || "",
          role: (roleMap.get(row.user_id) || []).join(", ") || "—",
          isSigned: Boolean(signature),
          signedAt: signature?.signedAt,
          method: signature?.method,
          metadata: signature?.metadata,
          isResponsible: responsibleIds.has(row.user_id),
        };
      });

      merged.sort((a, b) => {
        if (a.isSigned === b.isSigned) return a.fullName.localeCompare(b.fullName);
        return a.isSigned ? 1 : -1;
      });

      setUsers(merged);
      setIsLoading(false);
    };

    void load();
  }, [open, documentId, profile?.company_id, toast]);

  const hasResponsibilities = users.some((u) => u.isResponsible);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users
      .filter((user) => (showOnlyResponsibilities ? user.isResponsible : true))
      .filter((user) => {
        if (!normalizedSearch) return true;
        return (
          user.fullName.toLowerCase().includes(normalizedSearch) ||
          user.email.toLowerCase().includes(normalizedSearch)
        );
      });
  }, [search, showOnlyResponsibilities, users]);

  const signedCount = filteredUsers.filter((user) => user.isSigned).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Estado de firma {documentCode ? `· ${documentCode}` : ""}</DialogTitle>
          <DialogDescription>
            Firmas: {signedCount}/{filteredUsers.length}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o email..."
            className="sm:max-w-xs"
          />

          {hasResponsibilities && (
            <div className="flex items-center gap-2">
              <Switch
                id="show-only-responsibilities"
                checked={showOnlyResponsibilities}
                onCheckedChange={setShowOnlyResponsibilities}
              />
              <Label htmlFor="show-only-responsibilities">Sólo responsables</Label>
            </div>
          )}
        </div>

        <div className="max-h-[420px] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Fecha de firma</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.userId} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{user.fullName}</div>
                    {user.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{user.role}</td>
                  <td className="px-3 py-2">
                    <Badge variant={user.isSigned ? "default" : "secondary"}>
                      {user.isSigned ? "Firmado" : "Pendiente"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {user.signedAt ? new Date(user.signedAt).toLocaleString("es-ES") : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatMethod(user.method)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{user.metadata || "—"}</td>
                </tr>
              ))}

              {!isLoading && filteredUsers.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                    No hay usuarios para mostrar.
                  </td>
                </tr>
              )}

              {isLoading && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                    Cargando estado de firmas...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
