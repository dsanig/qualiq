import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  company_id: string | null;
  is_superadmin: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isRootAdmin: boolean;
  isLoading: boolean;
  refreshPermissions: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRootAdmin, setIsRootAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const readIsSuperadmin = async (userId: string) => {
    const { data, error } = await rpcClient.rpc("is_superadmin", { uid: userId });
    if (!error) return Boolean(data);
    return false;
  };

  const readIsAdministrador = async (userId: string) => {
    const { data, error } = await rpcClient.rpc("has_role", { _role: "Administrador", _user_id: userId });
    if (!error) return Boolean(data);
    return false;
  };

  useEffect(() => {
    const loadProfile = async (userId: string) => {
      try {
        const [{ data }, adminRole, superadminRole] = await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .or(`user_id.eq.${userId},id.eq.${userId}`)
            .maybeSingle(),
          readIsAdministrador(userId),
          readIsSuperadmin(userId),
        ]);

        setProfile((data as unknown as Profile | null) ?? null);
        setIsAdmin(adminRole || superadminRole);
        setIsRootAdmin(superadminRole);
      } catch {
        setProfile(null);
        setIsAdmin(false);
        setIsRootAdmin(false);
      }
    };

    const applySession = (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);

      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsRootAdmin(false);
      }
    };

    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 10000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      clearTimeout(safetyTimeout);
      applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: nextSession } }) => {
        clearTimeout(safetyTimeout);
        applySession(nextSession);
      })
      .catch(() => {
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Even if server-side logout fails, clear local state
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setIsRootAdmin(false);
  };

  const refreshPermissions = async () => {
    if (!user) {
      setIsAdmin(false);
      setIsRootAdmin(false);
      return;
    }

    const [adminRole, superadminRole] = await Promise.all([
      readIsAdministrador(user.id),
      readIsSuperadmin(user.id),
    ]);

    setIsAdmin(adminRole || superadminRole);
    setIsRootAdmin(superadminRole);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, isRootAdmin, isLoading, refreshPermissions, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
