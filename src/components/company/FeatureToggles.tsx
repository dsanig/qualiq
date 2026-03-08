import { useCallback, useEffect, useState } from "react";
import { ToggleLeft, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ALL_FEATURES } from "@/hooks/useCompanyFeatures";
import { useAuditLog } from "@/hooks/useAuditLog";

interface FeatureRow {
  id: string;
  feature_key: string;
  enabled: boolean;
  company_id: string;
}

interface FeatureTogglesProps {
  companyId: string;
}

export function FeatureToggles({ companyId }: FeatureTogglesProps) {
  const { toast } = useToast();
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFeatures = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("company_features")
      .select("id, feature_key, enabled, company_id")
      .eq("company_id", companyId);

    if (!error && data) {
      setFeatures(data as FeatureRow[]);
    }
    setIsLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (companyId) void fetchFeatures();
  }, [companyId, fetchFeatures]);

  const handleToggle = async (featureId: string, enabled: boolean) => {
    // Optimistic update
    setFeatures((prev) =>
      prev.map((f) => (f.id === featureId ? { ...f, enabled } : f))
    );

    const { error } = await (supabase as any)
      .from("company_features")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", featureId);

    if (error) {
      // Revert
      setFeatures((prev) =>
        prev.map((f) => (f.id === featureId ? { ...f, enabled: !enabled } : f))
      );
      toast({ title: "Error al actualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: enabled ? "Módulo activado" : "Módulo desactivado" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <ToggleLeft className="w-5 h-5 text-accent" />
        <div>
          <h3 className="font-semibold text-foreground">Módulos de la empresa</h3>
          <p className="text-sm text-muted-foreground">Activa o desactiva funcionalidades para esta empresa.</p>
        </div>
      </div>

      <div className="space-y-3">
        {ALL_FEATURES.map((feat) => {
          const row = features.find((f) => f.feature_key === feat.key);
          const enabled = row?.enabled ?? false;

          return (
            <div
              key={feat.key}
              className="flex items-center justify-between p-3 rounded-lg border border-border"
            >
              <Label htmlFor={`feat-${feat.key}`} className="text-sm font-medium text-foreground cursor-pointer">
                {feat.label}
              </Label>
              <Switch
                id={`feat-${feat.key}`}
                checked={enabled}
                onCheckedChange={(checked) => row && handleToggle(row.id, checked)}
                disabled={!row}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
