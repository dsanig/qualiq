import { useState, useEffect } from "react";
import { Bell, Save, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PERIOD_OPTIONS = [
  { value: "1", label: "1 día antes" },
  { value: "2", label: "2 días antes" },
  { value: "3", label: "3 días antes" },
  { value: "5", label: "5 días antes" },
  { value: "7", label: "7 días antes" },
  { value: "10", label: "10 días antes" },
  { value: "14", label: "14 días antes" },
  { value: "21", label: "21 días antes" },
  { value: "30", label: "30 días antes" },
];

export function NotificationSettings() {
  const { user } = useAuth();
  const [alertPeriod1, setAlertPeriod1] = useState("7");
  const [alertPeriod2, setAlertPeriod2] = useState("3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPreferences();
    }
  }, [user]);

  const fetchPreferences = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("alert_period_1, alert_period_2")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setAlertPeriod1(String(data.alert_period_1));
        setAlertPeriod2(String(data.alert_period_2));
      }
    } catch (e: any) {
      console.error("Error fetching preferences:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    const period1 = parseInt(alertPeriod1);
    const period2 = parseInt(alertPeriod2);

    // Validate: period1 must be greater than period2 by at least 1 day
    if (period1 <= period2) {
      toast.error("El primer periodo debe ser mayor que el segundo.");
      return;
    }

    if (period1 - period2 < 1) {
      toast.error("Debe haber al menos 1 día de diferencia entre los periodos.");
      return;
    }

    if (period2 < 1) {
      toast.error("El segundo periodo debe ser al menos 1 día antes del evento.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_notification_preferences")
        .upsert(
          {
            user_id: user.id,
            alert_period_1: period1,
            alert_period_2: period2,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;
      toast.success("Preferencias de notificación guardadas correctamente.");
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar las preferencias.");
    } finally {
      setSaving(false);
    }
  };

  // Filter options for period2 based on period1
  const period2Options = PERIOD_OPTIONS.filter(
    (opt) => parseInt(opt.value) < parseInt(alertPeriod1) - 0
  );

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-accent" />
        <div>
          <h3 className="font-semibold text-foreground">Alertas de eventos</h3>
          <p className="text-sm text-muted-foreground">
            Configura cuándo recibir notificaciones antes de cada evento.
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Recibirás <strong>3 notificaciones</strong> por cada evento: la primera y segunda según tus periodos configurados, y una tercera el <strong>día del evento</strong>.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="alert-period-1" className="text-sm font-medium">
            Primera alerta
          </Label>
          <Select value={alertPeriod1} onValueChange={setAlertPeriod1}>
            <SelectTrigger id="alert-period-1">
              <SelectValue placeholder="Selecciona un periodo" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="alert-period-2" className="text-sm font-medium">
            Segunda alerta
          </Label>
          <Select value={alertPeriod2} onValueChange={setAlertPeriod2}>
            <SelectTrigger id="alert-period-2">
              <SelectValue placeholder="Selecciona un periodo" />
            </SelectTrigger>
            <SelectContent>
              {period2Options.length > 0 ? (
                period2Options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="1" disabled>
                  Selecciona primero el primer periodo
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>Tercera alerta: <span className="font-medium text-foreground">El día del evento</span> (fija)</p>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
        Guardar preferencias
      </Button>
    </div>
  );
}
