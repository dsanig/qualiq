// Static demo data for the isolated demo mode (no DB connection)

export const demoIncidents = [
  { id: "1", title: "Desviación en temperatura cámara fría #3", type: "desviacion", status: "open", date: "2026-02-10", area: "Almacén", priority: "Alta" },
  { id: "2", title: "Reclamación cliente lote B-2024-089", type: "reclamacion", status: "in_progress", date: "2026-02-08", area: "Producción", priority: "Media" },
  { id: "3", title: "Error etiquetado producto X-100", type: "incidencia", status: "closed", date: "2026-01-28", area: "Acondicionamiento", priority: "Baja" },
  { id: "4", title: "Fallo en calibración pH-metro laboratorio", type: "desviacion", status: "open", date: "2026-02-14", area: "Control de Calidad", priority: "Alta" },
  { id: "5", title: "Contaminación cruzada Sala B", type: "incidencia", status: "in_progress", date: "2026-02-12", area: "Producción", priority: "Crítica" },
];

export const demoDocuments = [
  { id: "1", code: "SOP-001", title: "Procedimiento de limpieza de áreas estériles", category: "SOP", status: "approved", version: 3, updatedAt: "2026-01-15" },
  { id: "2", code: "PNT-012", title: "Control de temperatura en almacén", category: "PNT", status: "review", version: 2, updatedAt: "2026-02-01" },
  { id: "3", code: "SOP-045", title: "Gestión de residuos peligrosos", category: "SOP", status: "draft", version: 1, updatedAt: "2026-02-10" },
  { id: "4", code: "PNT-033", title: "Calibración de equipos analíticos", category: "PNT", status: "approved", version: 5, updatedAt: "2025-12-20" },
  { id: "5", code: "SOP-078", title: "Recepción y cuarentena de materias primas", category: "SOP", status: "approved", version: 2, updatedAt: "2026-01-30" },
];

export const demoAudits = [
  { id: "1", title: "Auditoría interna GMP Q1 2026", status: "open", date: "2026-03-15", auditor: "María García", findings: 3 },
  { id: "2", title: "Inspección AEMPS – Fabricación", status: "closed", date: "2025-11-20", auditor: "Inspector AEMPS", findings: 5 },
  { id: "3", title: "Auditoría proveedor MatPrima S.L.", status: "in_progress", date: "2026-02-05", auditor: "Carlos López", findings: 2 },
];

export const demoStats = {
  documents: 127,
  documentsReview: 23,
  openIncidents: 8,
  activeCAPAs: 5,
  sopCoverage: "94%",
  complianceScore: 87,
};
