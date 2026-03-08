import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface CompanyContextType {
  /** The company the superadmin is currently viewing (null = own company) */
  activeCompany: Company | null;
  /** All available companies (only populated for superadmins) */
  companies: Company[];
  /** Switch to a different company context */
  switchCompany: (companyId: string | null) => Promise<void>;
  /** Whether the context is loading */
  isLoading: boolean;
  /** The effective company_id to use in queries */
  effectiveCompanyId: string | null;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyContextProvider({ children }: { children: ReactNode }) {
  const { user, profile, isRootAdmin } = useAuth();
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load companies list for superadmins
  useEffect(() => {
    if (!isRootAdmin || !user) {
      setCompanies([]);
      setActiveCompany(null);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      try {
        // Fetch all companies
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name, slug, status")
          .order("name");

        setCompanies(companiesData ?? []);

        // Fetch current override
        const { data: ctx } = await supabase
          .from("superadmin_context" as any)
          .select("active_company_id")
          .eq("user_id", user.id)
          .maybeSingle();

        const overrideId = (ctx as any)?.active_company_id;
        if (overrideId && companiesData) {
          const found = companiesData.find((c) => c.id === overrideId);
          setActiveCompany(found ?? null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [isRootAdmin, user]);

  const switchCompany = useCallback(
    async (companyId: string | null) => {
      if (!user || !isRootAdmin) return;

      if (companyId === null) {
        // Clear override — delete row
        await supabase
          .from("superadmin_context" as any)
          .delete()
          .eq("user_id", user.id);
        setActiveCompany(null);
      } else {
        // Upsert override
        await (supabase.from("superadmin_context" as any) as any).upsert(
          { user_id: user.id, active_company_id: companyId, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
        const found = companies.find((c) => c.id === companyId);
        setActiveCompany(found ?? null);
      }
    },
    [user, isRootAdmin, companies]
  );

  const effectiveCompanyId = activeCompany?.id ?? profile?.company_id ?? null;

  return (
    <CompanyContext.Provider value={{ activeCompany, companies, switchCompany, isLoading, effectiveCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompanyContext must be used within a CompanyContextProvider");
  }
  return context;
}
