import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ALL_FEATURES = [
  { key: "documents", label: "Documentos" },
  { key: "incidents", label: "Incidencias" },
  { key: "audits", label: "Auditorías" },
  { key: "training", label: "Formación" },
  { key: "audit-simulator", label: "Simulador Auditoría" },
  { key: "predictive-analytics", label: "Análisis Predictivo" },
  { key: "chatbot", label: "Asistente IA" },
] as const;

export type FeatureKey = (typeof ALL_FEATURES)[number]["key"];

interface CompanyFeaturesState {
  enabledFeatures: Set<FeatureKey>;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useCompanyFeatures(): CompanyFeaturesState {
  const [enabledFeatures, setEnabledFeatures] = useState<Set<FeatureKey>>(
    new Set(ALL_FEATURES.map((f) => f.key))
  );
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("company_features")
      .select("feature_key, enabled");

    if (!error && data) {
      const enabled = new Set<FeatureKey>(
        (data as { feature_key: string; enabled: boolean }[])
          .filter((r) => r.enabled)
          .map((r) => r.feature_key as FeatureKey)
      );
      setEnabledFeatures(enabled);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { enabledFeatures, isLoading, refresh };
}
