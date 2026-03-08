import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Shield, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Play, 
  Loader2, 
  FileSearch,
  ChevronDown,
  ChevronUp,
  Trash2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AuditSimulation {
  id: string;
  simulation_type: string;
  status: string;
  summary: string | null;
  risk_score: number | null;
  total_findings: number;
  critical_findings: number;
  major_findings: number;
  minor_findings: number;
  created_at: string;
  completed_at: string | null;
}

interface AuditFinding {
  id: string;
  severity: string;
  category: string;
  finding_title: string;
  finding_description: string;
  regulation_reference: string | null;
  recommendation: string;
  affected_area: string | null;
}

const SIMULATION_TYPES = [
  { value: "aemps", label: "AEMPS (España)", description: "Inspección de la Agencia Española de Medicamentos" },
  { value: "ema", label: "EMA (Europa)", description: "Inspección de la Agencia Europea de Medicamentos" },
  { value: "fda", label: "FDA (EE.UU.)", description: "Inspección de la Food and Drug Administration" },
  { value: "aesan", label: "AESAN (Alimentación)", description: "Inspección de Seguridad Alimentaria" },
];

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Crítico" },
  major: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: "Mayor" },
  minor: { icon: Info, color: "text-accent", bg: "bg-accent/10", label: "Menor" },
  observation: { icon: Info, color: "text-muted-foreground", bg: "bg-secondary", label: "Observación" },
};

export function AuditSimulatorView() {
  const { user, profile } = useAuth();
  const [simulations, setSimulations] = useState<AuditSimulation[]>([]);
  const [selectedSimulation, setSelectedSimulation] = useState<AuditSimulation | null>(null);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [simulationType, setSimulationType] = useState("aemps");
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSimulations();
  }, []);

  const fetchSimulations = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("audit_simulations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error fetching simulations:", error);
    } else {
      setSimulations(data || []);
    }
    setIsLoading(false);
  };

  const runSimulation = async () => {
    if (!profile?.company_id) {
      toast({
        title: "Error",
        description: "No se encontró la empresa asociada",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);

    try {
      // Create simulation record
      const { data: simulation, error: createError } = await supabase
        .from("audit_simulations")
        .insert({
          company_id: profile.company_id,
          created_by: user!.id,
          simulation_type: simulationType,
          status: "pending",
        })
        .select()
        .single();

      if (createError) throw createError;

      // Fetch all company documents for comprehensive analysis
      const { data: documents } = await supabase
        .from("documents")
        .select("id, code, title, category, version, status, typology")
        .eq("company_id", profile.company_id)
        .limit(100);

      // Run simulation
      const { error: runError } = await supabase.functions.invoke("run-audit-simulation", {
        body: {
          simulationId: simulation.id,
          simulationType,
          documents: documents || [],
        },
      });

      if (runError) throw runError;

      toast({
        title: "Simulación completada",
        description: "Los resultados de la inspección simulada están listos",
      });

      fetchSimulations();
    } catch (e) {
      console.error("Error running simulation:", e);
      toast({
        title: "Error",
        description: "No se pudo ejecutar la simulación",
        variant: "destructive",
      });
    }

    setIsRunning(false);
  };

  const viewSimulationDetails = async (simulation: AuditSimulation) => {
    setSelectedSimulation(simulation);

    const { data } = await supabase
      .from("audit_findings")
      .select("*")
      .eq("simulation_id", simulation.id)
      .order("severity");

    setFindings(data || []);
  };

  const toggleFinding = (id: string) => {
    const newExpanded = new Set(expandedFindings);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFindings(newExpanded);
  };

  const deleteSimulation = async (simId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      // Delete findings first (FK constraint)
      await supabase.from("audit_findings").delete().eq("simulation_id", simId);
      const { error } = await supabase.from("audit_simulations").delete().eq("id", simId);
      if (error) throw error;

      toast({ title: "Simulación eliminada" });
      if (selectedSimulation?.id === simId) setSelectedSimulation(null);
      setSimulations((prev) => prev.filter((s) => s.id !== simId));
    } catch (err) {
      console.error("Error deleting simulation:", err);
      toast({ title: "Error", description: "No se pudo eliminar la simulación", variant: "destructive" });
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return "text-destructive";
    if (score >= 60) return "text-warning";
    if (score >= 40) return "text-accent";
    return "text-success";
  };

  if (selectedSimulation) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedSimulation(null)}>
            ← Volver a simulaciones
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant={selectedSimulation.status === "completed" ? "default" : "secondary"}>
              {SIMULATION_TYPES.find((t) => t.value === selectedSimulation.simulation_type)?.label}
            </Badge>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar esta simulación?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán todos los hallazgos asociados. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteSimulation(selectedSimulation.id)}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Resultados de la Inspección Simulada
            </CardTitle>
            <CardDescription>
              {new Date(selectedSimulation.created_at).toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Risk Score */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-4xl font-bold ${getRiskColor(selectedSimulation.risk_score || 0)}`}>
                  {selectedSimulation.risk_score || 0}
                </div>
                <p className="text-sm text-muted-foreground">Puntuación de Riesgo</p>
              </div>
              <div className="flex-1">
                <Progress value={selectedSimulation.risk_score || 0} className="h-3" />
              </div>
            </div>

            {/* Findings Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <div className="text-2xl font-bold text-destructive">{selectedSimulation.critical_findings}</div>
                <p className="text-xs text-muted-foreground">Críticos</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-warning/10">
                <div className="text-2xl font-bold text-warning">{selectedSimulation.major_findings}</div>
                <p className="text-xs text-muted-foreground">Mayores</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-accent/10">
                <div className="text-2xl font-bold text-accent">{selectedSimulation.minor_findings}</div>
                <p className="text-xs text-muted-foreground">Menores</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary">
                <div className="text-2xl font-bold text-foreground">{selectedSimulation.total_findings}</div>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>

            {/* Summary */}
            {selectedSimulation.summary && (
              <div className="p-4 rounded-lg bg-secondary/50 border">
                <p className="text-sm font-medium mb-2">Resumen Ejecutivo:</p>
                <p className="text-sm text-muted-foreground">{selectedSimulation.summary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Findings List */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Hallazgos Detallados</h3>
          {findings.map((finding) => {
            const config = SEVERITY_CONFIG[finding.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.observation;
            const Icon = config.icon;
            const isExpanded = expandedFindings.has(finding.id);

            return (
              <Collapsible key={finding.id} open={isExpanded} onOpenChange={() => toggleFinding(finding.id)}>
                <Card>
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${config.bg}`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={config.color}>
                              {config.label}
                            </Badge>
                            <Badge variant="secondary">{finding.category}</Badge>
                          </div>
                          <CardTitle className="text-base">{finding.finding_title}</CardTitle>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Descripción:</p>
                        <p className="text-sm text-muted-foreground">{finding.finding_description}</p>
                      </div>
                      {finding.regulation_reference && (
                        <div>
                          <p className="text-sm font-medium mb-1">Referencia Normativa:</p>
                          <p className="text-sm text-accent">{finding.regulation_reference}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium mb-1">Recomendación:</p>
                        <p className="text-sm text-muted-foreground">{finding.recommendation}</p>
                      </div>
                      {finding.affected_area && (
                        <Badge variant="outline">Área afectada: {finding.affected_area}</Badge>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Simulador de Auditorías</h2>
          <p className="text-sm text-muted-foreground">
            La IA actúa como inspector para detectar hallazgos antes de una inspección real
          </p>
        </div>
      </div>

      {/* New Simulation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="w-5 h-5" />
            Nueva Simulación de Inspección
          </CardTitle>
          <CardDescription>
            Selecciona el tipo de inspección para simular y detectar posibles hallazgos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={simulationType} onValueChange={setSimulationType}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIMULATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs text-muted-foreground">{type.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runSimulation} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Ejecutar Simulación
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Previous Simulations */}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground">Simulaciones Anteriores</h3>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : simulations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">Sin simulaciones previas</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ejecuta tu primera simulación de inspección
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {simulations.map((sim) => (
              <Card key={sim.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => viewSimulationDetails(sim)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">
                      {SIMULATION_TYPES.find((t) => t.value === sim.simulation_type)?.label}
                    </Badge>
                    <Badge variant={sim.status === "completed" ? "default" : "secondary"}>
                      {sim.status === "completed" ? "Completada" : "En proceso"}
                    </Badge>
                  </div>
                  <CardDescription>
                    {new Date(sim.created_at).toLocaleDateString("es-ES")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${getRiskColor(sim.risk_score || 0)}`}>
                          {sim.risk_score || "-"}
                        </div>
                        <p className="text-xs text-muted-foreground">Riesgo</p>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-foreground">{sim.total_findings}</div>
                        <p className="text-xs text-muted-foreground">Hallazgos</p>
                      </div>
                    </div>
                    {sim.critical_findings > 0 && (
                      <Badge variant="destructive">{sim.critical_findings} críticos</Badge>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-0 justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar esta simulación?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminarán todos los hallazgos asociados. Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => deleteSimulation(sim.id, e)}>
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
