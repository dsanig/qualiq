import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

interface PermissionsState {
  isLoading: boolean;
  isSuperadmin: boolean;
  isAdministrador: boolean;
  isEditor: boolean;
  canManageCompany: boolean;
  canEditContent: boolean;
  isViewer: boolean;
  canManagePasswords: boolean;
  refreshPermissions: () => Promise<void>;
}

export function usePermissions(): PermissionsState {
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [isAdministrador, setIsAdministrador] = useState(false);
  const [isEditor, setIsEditor] = useState(false);

  const refreshPermissions = useCallback(async () => {
    setIsLoading(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setIsSuperadmin(false);
      setIsAdministrador(false);
      setIsEditor(false);
      setIsLoading(false);
      return;
    }

    const userId = session.user.id;

    const [superRes, adminRes, editorRes] = await Promise.all([
      rpcClient.rpc("is_superadmin", { uid: userId }),
      rpcClient.rpc("has_role", { uid: userId, r: "Administrador" }),
      rpcClient.rpc("has_role", { uid: userId, r: "Editor" }),
    ]);

    setIsSuperadmin(!superRes.error && Boolean(superRes.data));
    setIsAdministrador(!adminRes.error && Boolean(adminRes.data));
    setIsEditor(!editorRes.error && Boolean(editorRes.data));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshPermissions();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshPermissions();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshPermissions]);

  const canManageCompany = isSuperadmin || isAdministrador;
  const canEditContent = canManageCompany || isEditor;

  return {
    isLoading,
    isSuperadmin,
    isAdministrador,
    isEditor,
    canManageCompany,
    canEditContent,
    isViewer: !canEditContent,
    canManagePasswords: isSuperadmin,
    refreshPermissions,
  };
}
