import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LandingPage } from "@/components/landing/LandingPage";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { DocumentsView } from "@/components/documents/DocumentsView";
import { IncidentsView } from "@/components/incidents/IncidentsView";
import { ReclamacionesView } from "@/components/reclamaciones/ReclamacionesView";
import { ChatbotView } from "@/components/chatbot/ChatbotView";
import { useAuth } from "@/hooks/useAuth";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { FilterModal, type FiltersState } from "@/components/filters/FilterModal";
import { useCompanyFeatures } from "@/hooks/useCompanyFeatures";
import { PendingActionsView } from "@/components/dashboard/PendingActionsView";
import { CompanyView } from "@/components/company/CompanyView";
import { SettingsView } from "@/components/settings/SettingsView";
import { TrainingExamView } from "@/components/training/TrainingExamView";
import { TrainingManagementView } from "@/components/training/TrainingManagementView";
import { AuditSimulatorView } from "@/components/audit/AuditSimulatorView";
import { PredictiveAnalyticsView } from "@/components/analytics/PredictiveAnalyticsView";
import { AuditManagementView } from "@/components/audit/AuditManagementView";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const moduleConfig: Record<string, { title: string; subtitle?: string }> = {
  dashboard: { title: "Panel de Control", subtitle: "Visión general del estado de cumplimiento" },
  documents: { title: "Gestión Documental", subtitle: "SOPs, PNTs y documentación de calidad" },
  incidents: { title: "Incidencias", subtitle: "No conformidades, desviaciones y CAPAs" },
  reclamaciones: { title: "Reclamaciones", subtitle: "Gestión de reclamaciones de clientes, proveedores y terceros" },
  audits: { title: "Auditorías", subtitle: "Gestión de auditorías, CAPA y acciones" },
  training: { title: "Gestión de Formaciones", subtitle: "Registros de formaciones impartidas y recibidas" },
  "training-exam": { title: "Examen de Formación", subtitle: "Evaluación de comprensión de procedimientos" },
  "audit-simulator": { title: "Simulador de Auditoría", subtitle: "Simulación de inspecciones FDA/EMA" },
  "predictive-analytics": { title: "Análisis Predictivo CAPA", subtitle: "Detección de patrones y acciones preventivas" },
  chatbot: { title: "Asistente IA", subtitle: "Consultas basadas en documentación y normativa" },
  company: { title: "Empresa", subtitle: "Configuración y datos de la organización" },
  settings: { title: "Configuración", subtitle: "Preferencias y ajustes del sistema" },
  "pending-actions": { title: "Acciones Pendientes", subtitle: "Seguimiento completo de tareas y aprobaciones" },
};

type IncidentType = "incidencia" | "desviacion" | "no_conformidad" | "otra";

interface IncidentPrefillPayload {
  title: string;
  description: string;
  sourceInsightId?: string;
  sourceReclamacionId?: string;
}

const Index = () => {
  const location = useLocation();
  const [activeModule, setActiveModule] = useState(() => location.pathname === "/documentos" ? "documents" : "dashboard");
  const [moduleSearchQueries, setModuleSearchQueries] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<FiltersState>({
    category: "all",
    documentTypology: "all",
    documentStatus: "all",
    signatureStatus: "all",
    incidentArea: "all",
    incidentStatus: "all",
    incidentPriority: "all",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isNewDocumentOpen, setIsNewDocumentOpen] = useState(false);
  const [isNewIncidentOpen, setIsNewIncidentOpen] = useState(false);
  const [incidentViewResetSeed, setIncidentViewResetSeed] = useState(0);
  const [incidentTypeSeed, setIncidentTypeSeed] = useState<IncidentType | undefined>(undefined);
  const [incidentPrefill, setIncidentPrefill] = useState<IncidentPrefillPayload | null>(null);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);
  const [openReclamacionId, setOpenReclamacionId] = useState<string | null>(null);
  const [isNewReclamacionOpen, setIsNewReclamacionOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const { enabledFeatures } = useCompanyFeatures();
  const navigate = useNavigate();
  
  // Auto-logout after 10 minutes of inactivity
  useInactivityLogout();

  useEffect(() => {
    if (location.pathname === "/documentos") {
      setActiveModule("documents");
    }
  }, [location.pathname]);

  const handleGetStarted = () => {
    navigate("/auth");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onGetStarted={handleGetStarted} />;
  }

  const currentModule = moduleConfig[activeModule] || moduleConfig.dashboard;
  const searchPlaceholder = (() => {
    switch (activeModule) {
      case "documents":
        return "Buscar documentos...";
      case "incidents":
        return "Buscar incidencias...";
      case "reclamaciones":
        return "Buscar reclamaciones...";
      case "audits":
        return "Buscar auditorías...";
      default:
        return "Buscar documentos...";
    }
  })();


  const activeSearchQuery = moduleSearchQueries[activeModule] ?? "";

  const handleSearchChange = (value: string) => {
    setModuleSearchQueries((prev) => ({ ...prev, [activeModule]: value }));
  };

  const handleSearchClear = () => {
    setModuleSearchQueries((prev) => ({ ...prev, [activeModule]: "" }));
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "Nuevo Documento":
        setActiveModule("documents");
        setIsNewDocumentOpen(true);
        break;
      case "Registrar Incidencia":
        setActiveModule("incidents");
        setIncidentTypeSeed("incidencia");
        setIsNewIncidentOpen(true);
        break;
      case "Crear CAPA":
        setActiveModule("audits");
        break;
      case "Registrar Reclamación":
        setActiveModule("reclamaciones");
        setIsNewReclamacionOpen(true);
        break;
      default:
        break;
    }
  };

  const handleViewPendingActions = () => {
    setActiveModule("pending-actions");
  };

  const handleViewIncidents = () => {
    setActiveModule("incidents");
  };

  const handleCreateIncidentFromInsight = (prefill: IncidentPrefillPayload) => {
    setIncidentTypeSeed("incidencia");
    setIncidentPrefill(prefill);
    setActiveModule("incidents");
    setIsNewIncidentOpen(true);
  };

  const handleNavigateToDocument = (documentCode: string) => {
    setModuleSearchQueries((prev) => ({ ...prev, documents: documentCode }));
    setActiveModule("documents");
  };

  const renderModule = () => {
    switch (activeModule) {
      case "dashboard":
        return (
          <DashboardView
            onQuickAction={handleQuickAction}
            onViewPendingActions={handleViewPendingActions}
            onViewIncidents={handleViewIncidents}
            onNavigateToDocument={handleNavigateToDocument}
            onNavigateToModule={setActiveModule}
          />
        );
      case "documents":
        return (
          <DocumentsView
            searchQuery={activeSearchQuery}
            onSearchChange={handleSearchChange}
            filters={filters}
            onFiltersChange={setFilters}
            onOpenFilters={() => setIsFilterOpen(true)}
            isNewDocumentOpen={isNewDocumentOpen}
            onNewDocumentOpenChange={setIsNewDocumentOpen}
          />
        );
      case "incidents":
        return (
          <ErrorBoundary
            title="Error cargando Incidencias"
            description="Se produjo un problema inesperado al abrir el módulo de incidencias."
            retryLabel="Reintentar"
            onRetry={() => setIncidentViewResetSeed((prev) => prev + 1)}
            resetKeys={[incidentViewResetSeed, activeModule]}
          >
            <IncidentsView
              key={`incidents-${incidentViewResetSeed}`}
              searchQuery={activeSearchQuery}
              onSearchChange={handleSearchChange}
              filters={filters}
              onFiltersChange={setFilters}
              onOpenFilters={() => setIsFilterOpen(true)}
              isNewIncidentOpen={isNewIncidentOpen}
              onNewIncidentOpenChange={setIsNewIncidentOpen}
              initialIncidentType={incidentTypeSeed}
              reloadToken={incidentViewResetSeed}
              prefill={incidentPrefill}
              onPrefillConsumed={() => setIncidentPrefill(null)}
              openIncidentId={openIncidentId}
              onOpenIncidentConsumed={() => setOpenIncidentId(null)}
              onNavigateToReclamacion={(recId) => {
                setOpenReclamacionId(recId);
                setActiveModule("reclamaciones");
              }}
            />
          </ErrorBoundary>
        );
      case "reclamaciones":
        return (
          <ReclamacionesView
            searchQuery={activeSearchQuery}
            onSearchChange={handleSearchChange}
            onOpenNewIncident={(reclamacionId, reclamacionTitle) => {
              setIncidentTypeSeed("incidencia");
              setIncidentPrefill({ title: `Incidencia desde reclamación: ${reclamacionTitle}`, description: `Incidencia generada a partir de la reclamación "${reclamacionTitle}".`, sourceReclamacionId: reclamacionId });
              setActiveModule("incidents");
              setIsNewIncidentOpen(true);
            }}
            onNavigateToIncident={(incidenciaId) => {
              setOpenIncidentId(incidenciaId);
              setActiveModule("incidents");
            }}
            openReclamacionId={openReclamacionId}
            onOpenReclamacionConsumed={() => setOpenReclamacionId(null)}
            isNewOpenExternal={isNewReclamacionOpen}
            onNewOpenExternalConsumed={() => setIsNewReclamacionOpen(false)}
          />
        );
      case "audits":
        return <AuditManagementView searchQuery={activeSearchQuery} />;
      case "chatbot":
        return <ChatbotView />;
      case "training":
        return <TrainingManagementView />;
      case "training-exam":
        return <TrainingExamView />;
      case "audit-simulator":
        return <AuditSimulatorView />;
      case "predictive-analytics":
        return <PredictiveAnalyticsView onCreateIncidentFromInsight={handleCreateIncidentFromInsight} />;
      case "company":
        return <CompanyView />;
      case "settings":
        return <SettingsView />;
      case "pending-actions":
        return (
          <PendingActionsView
            onNavigateToIncident={(incidentId) => {
              setOpenIncidentId(incidentId);
              setActiveModule("incidents");
            }}
          />
        );
      default:
        return (
          <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border">
            <p className="text-muted-foreground">Módulo en desarrollo</p>
          </div>
        );
    }
  };

  return (
    <AppLayout
      activeModule={activeModule}
      onModuleChange={setActiveModule}
      title={currentModule.title}
      subtitle={currentModule.subtitle}
      searchQuery={activeSearchQuery}
      onSearchChange={handleSearchChange}
      onSearchSubmit={() => handleSearchChange(activeSearchQuery)}
      onSearchClear={handleSearchClear}
      searchPlaceholder={searchPlaceholder}
      enabledFeatures={enabledFeatures}
    >
      {renderModule()}
      <FilterModal
        open={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        filters={filters}
        onFiltersChange={setFilters}
      />
    </AppLayout>
  );
};

export default Index;
