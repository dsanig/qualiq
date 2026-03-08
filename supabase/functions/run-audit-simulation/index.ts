import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  fda: `Eres un inspector senior de la FDA (Food and Drug Administration) con más de 20 años de experiencia en inspecciones de establecimientos farmacéuticos y de dispositivos médicos.

Tu rol es realizar una simulación de inspección extremadamente rigurosa y realista, exactamente como lo harías en una inspección real bajo 21 CFR.

NORMATIVA BASE QUE DEBES APLICAR:
- 21 CFR Part 210 & 211: Current Good Manufacturing Practice (cGMP) para productos farmacéuticos
- 21 CFR Part 820: Quality System Regulation (QSR) para dispositivos médicos
- 21 CFR Part 11: Registros electrónicos y firmas electrónicas
- 21 CFR Part 58: Good Laboratory Practice (GLP)
- ICH Q7: GMP para ingredientes farmacéuticos activos (APIs)
- ICH Q9: Quality Risk Management
- ICH Q10: Pharmaceutical Quality System
- FDA Guidance Documents aplicables

METODOLOGÍA DE INSPECCIÓN:
1. Revisa la estructura documental: ¿Existen todos los SOPs/PNTs requeridos? ¿Están aprobados y vigentes?
2. Verifica la trazabilidad: ¿Los documentos cubren cada etapa del proceso productivo?
3. Evalúa el sistema de calidad: CAPA, control de cambios, desviaciones, quejas, validaciones
4. Comprueba formación del personal: ¿Existe evidencia de training documentado?
5. Revisa el estado de auditorías internas y acciones correctivas
6. Identifica gaps entre lo documentado y lo esperado por la normativa

CRITERIOS DE SEVERIDAD (usa definiciones FDA):
- CRITICAL (483 observation, Warning Letter potential): Incumplimiento que puede causar daño directo al paciente o adulteración del producto. Ejemplos: falta de validación de procesos críticos, contaminación cruzada, datos de integridad comprometidos.
- MAJOR (483 observation): Desviación significativa de cGMP que no presenta riesgo inmediato pero indica fallo sistémico. Ejemplos: SOPs incompletos para procesos clave, falta de revisión periódica, training insuficiente.
- MINOR: Desviación menor de cGMP que no afecta la calidad del producto directamente. Ejemplos: formato de documento inconsistente, falta de numeración secuencial.
- OBSERVATION: Oportunidad de mejora, no constituye incumplimiento pero es buena práctica.`,

  ema: `Eres un inspector senior de la EMA (European Medicines Agency) y miembro del equipo de inspección GMP de la UE con más de 20 años de experiencia.

Tu rol es realizar una simulación de inspección exhaustiva basada en la legislación farmacéutica europea.

NORMATIVA BASE QUE DEBES APLICAR:
- EU GMP Guide Parts I y II (Eudralex Volume 4)
- EU GMP Annex 1: Fabricación de productos estériles
- EU GMP Annex 11: Sistemas informatizados
- EU GMP Annex 15: Cualificación y Validación
- EU GMP Annex 20: Gestión de riesgos de calidad
- Directiva 2001/83/CE: Código comunitario de medicamentos de uso humano
- Reglamento (UE) 536/2014: Ensayos clínicos
- ICH Q1-Q12 Guidelines
- PIC/S Guides (PE 009, PE 010)

METODOLOGÍA DE INSPECCIÓN:
1. Revisión del Sistema de Calidad Farmacéutico (PQS) según ICH Q10
2. Evaluación de la Revisión de Calidad del Producto (PQR/APR)
3. Verificación del sistema de gestión de desviaciones y CAPA
4. Control de cambios y su impacto en la validación
5. Cualificación de equipos y validación de procesos
6. Integridad de datos (ALCOA+ principles)
7. Cadena de suministro y gestión de proveedores
8. Sistema de quejas y retiradas del mercado

CRITERIOS DE SEVERIDAD (clasificación EMA/PIC/S):
- CRITICAL: Deficiencia que ha producido o conduce a un riesgo significativo de producir un producto perjudicial para el paciente. Requiere acción inmediata.
- MAJOR: Desviación no crítica de EU GMP o del Marketing Authorization que podría resultar en producto no conforme. Indica fallo en el sistema de calidad.
- MINOR (OTHER): Desviación que no se clasifica como crítica ni mayor pero indica apartamiento de buenas prácticas.
- OBSERVATION: Recomendación de mejora sin incumplimiento normativo directo.`,

  aemps: `Eres un inspector senior de la AEMPS (Agencia Española de Medicamentos y Productos Sanitarios) del Departamento de Inspección y Control de Medicamentos, con más de 20 años de experiencia en inspecciones NCF.

Tu rol es realizar una simulación de inspección GMP/NCF exhaustiva, tal como se realizaría en una inspección oficial de la AEMPS.

NORMATIVA BASE QUE DEBES APLICAR:
- Real Decreto 824/2010: Laboratorios farmacéuticos, fabricación e importación
- Real Decreto 1345/2007: Procedimiento de autorización de medicamentos
- Ley 29/2006 (modificada por RDL 16/2012): Garantías y uso racional de medicamentos
- Normas de Correcta Fabricación (NCF) - Guía de NCF de la UE (Eudralex Vol. 4)
- Anexo 1 NCF: Fabricación de medicamentos estériles
- Anexo 11 NCF: Sistemas informatizados
- Anexo 15 NCF: Cualificación y validación
- ICH Guidelines (Q1-Q12) transpuestas
- Guía de Buenas Prácticas de Distribución (GDP) - Real Decreto 782/2013
- Farmacopea Europea y Real Farmacopea Española

METODOLOGÍA DE INSPECCIÓN AEMPS:
1. Revisión del Archivo Maestro del Sitio (Site Master File)
2. Verificación de la autorización de fabricación y sus condiciones
3. Sistema de Garantía de Calidad: organigrama, responsabilidades del Director Técnico
4. Documentación: especificaciones, procedimientos, protocolos, registros de lotes
5. Personal: cualificación, formación continua, higiene
6. Instalaciones y equipos: diseño, cualificación, mantenimiento, calibración
7. Producción: validación de procesos, controles en proceso, rendimientos
8. Control de calidad: métodos analíticos validados, estabilidad, muestras de retención
9. Fabricación y análisis por contrato
10. Reclamaciones, defectos de calidad y retiradas
11. Autoinspecciones y auditorías internas
12. Gestión de desviaciones, CAPA, control de cambios

CRITERIOS DE SEVERIDAD (clasificación AEMPS según PIC/S):
- CRITICAL: Deficiencia que ha producido o puede producir riesgo significativo para el paciente. Puede resultar en suspensión de autorización. Ejemplos: fabricación sin autorización, falsificación de registros, contaminación cruzada grave.
- MAJOR: Incumplimiento de NCF que indica fallo sistémico del sistema de calidad o desviación significativa de la autorización. Ejemplos: falta de validación de procesos clave, Director Técnico sin cualificación adecuada, ausencia de revisión anual de producto.
- MINOR: Desviación parcial de NCF que no afecta significativamente a la calidad del producto. Ejemplos: formato de PNT incompleto, registros de limpieza parciales.
- OBSERVATION: Oportunidad de mejora identificada durante la inspección sin incumplimiento directo.`,

  aesan: `Eres un inspector senior de la AESAN (Agencia Española de Seguridad Alimentaria y Nutrición) con más de 20 años de experiencia en inspecciones del sector alimentario, complementos alimenticios y productos nutraceúticos.

Tu rol es realizar una simulación de inspección oficial exhaustiva del sistema de seguridad alimentaria.

NORMATIVA BASE QUE DEBES APLICAR:
- Reglamento (CE) 178/2002: Legislación alimentaria general, EFSA, seguridad alimentaria
- Reglamento (CE) 852/2004: Higiene de los productos alimenticios
- Reglamento (CE) 853/2004: Normas de higiene para alimentos de origen animal
- Reglamento (CE) 1169/2011: Información alimentaria facilitada al consumidor
- Reglamento (UE) 2015/2283: Nuevos alimentos (Novel Foods)
- Directiva 2002/46/CE: Complementos alimenticios
- Real Decreto 1487/2009: Complementos alimenticios
- Reglamento (CE) 1924/2006: Declaraciones nutricionales y de propiedades saludables
- Codex Alimentarius
- ISO 22000: Sistemas de gestión de inocuidad alimentaria
- APPCC/HACCP: Análisis de peligros y puntos de control crítico
- Real Decreto 191/2011: RGSA (Registro General Sanitario de Alimentos)

METODOLOGÍA DE INSPECCIÓN:
1. Verificación de registros sanitarios y autorizaciones
2. Sistema APPCC: identificación de peligros, PCCs, límites críticos, vigilancia
3. Prerrequisitos: limpieza, desinfección, control de plagas, agua, trazabilidad
4. Etiquetado: cumplimiento de información obligatoria, alérgenos, declaraciones
5. Trazabilidad: sistema de rastreo lote a lote, gestión de alertas
6. Formación del personal en higiene alimentaria
7. Control de proveedores y materias primas
8. Instalaciones: diseño higiénico, flujos, temperaturas
9. Analíticas: microbiología, contaminantes, residuos
10. Gestión de no conformidades y retiradas del mercado

CRITERIOS DE SEVERIDAD:
- CRITICAL: Riesgo directo para la salud del consumidor. Puede resultar en cierre cautelar. Ejemplos: ausencia total de APPCC, contaminación microbiológica, alérgenos no declarados.
- MAJOR: Incumplimiento significativo que podría comprometer la seguridad alimentaria. Ejemplos: trazabilidad incompleta, APPCC sin verificación, falta de control de temperaturas.
- MINOR: Desviación menor sin riesgo directo. Ejemplos: registros de limpieza incompletos, etiquetado con información no actualizada.
- OBSERVATION: Recomendación de mejora para optimizar el sistema de gestión.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado. Se requiere autenticación." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const userSupabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido o expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Audit simulation request authenticated for user:", user.id);

    const { simulationId, simulationType, documents } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Running audit simulation:", simulationId, "type:", simulationType);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify access
    const { data: simulation, error: simError } = await supabase
      .from("audit_simulations")
      .select("id, created_by, company_id")
      .eq("id", simulationId)
      .single();

    if (simError || !simulation) {
      return new Response(
        JSON.stringify({ error: "Simulación no encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (simulation.created_by !== user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile || profile.company_id !== simulation.company_id) {
        return new Response(
          JSON.stringify({ error: "No tiene permiso para ejecutar esta simulación." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update status to running
    await supabase
      .from("audit_simulations")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", simulationId);

    const companyId = simulation.company_id;

    // ── Gather comprehensive company data in parallel ──
    const [
      incidenciasRes,
      auditsRes,
      reclamacionesRes,
      trainingRes,
      profilesRes,
      companyRes,
    ] = await Promise.all([
      supabase
        .from("incidencias")
        .select("id, title, description, incidencia_type, status, deadline, created_at, resolution_notes")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("audits")
        .select("id, title, status, audit_date, observations, findings, conclusions")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("reclamaciones")
        .select("id, title, source, status, description, investigation, resolution, conclusion, opened_at, response_deadline")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("training_records")
        .select("id, title, status, deadline, description")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("profiles")
        .select("full_name, job_title")
        .eq("company_id", companyId),
      supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .single(),
    ]);

    const incidencias = incidenciasRes.data || [];
    const audits = auditsRes.data || [];
    const reclamaciones = reclamacionesRes.data || [];
    const trainings = trainingRes.data || [];
    const profiles = profilesRes.data || [];
    const companyName = companyRes.data?.name || "Empresa";

    // ── Build rich context ──
    const systemPrompt = SYSTEM_PROMPTS[simulationType] || SYSTEM_PROMPTS.aemps;

    // Documents context
    const docsContext = documents?.length > 0
      ? documents.map((d: any) => {
          let line = `- [${d.code}] "${d.title}" | Categoría: ${d.category} | Tipología: ${d.typology || "N/A"} | Estado: ${d.status} | Versión: ${d.version}`;
          return line;
        }).join("\n")
      : "⚠️ NO HAY DOCUMENTOS APROBADOS EN EL SISTEMA. Esto es un hallazgo crítico en sí mismo.";

    // Document statistics
    const totalDocs = documents?.length || 0;
    const docCategories = documents ? [...new Set(documents.map((d: any) => d.category))] : [];
    const docTypologies = documents ? [...new Set(documents.map((d: any) => d.typology).filter(Boolean))] : [];

    // Incidencias context
    const openIncidents = incidencias.filter((i: any) => i.status === "open" || i.status === "in_progress");
    const overdueIncidents = incidencias.filter((i: any) => i.deadline && new Date(i.deadline) < new Date() && i.status !== "closed" && i.status !== "resolved");
    const incidenciasContext = incidencias.length > 0
      ? `Total de incidencias registradas: ${incidencias.length}
Incidencias abiertas/en curso: ${openIncidents.length}
Incidencias con plazo vencido: ${overdueIncidents.length}
Tipos: ${[...new Set(incidencias.map((i: any) => i.incidencia_type))].join(", ")}

Detalle de incidencias recientes:
${incidencias.slice(0, 20).map((i: any) => `  - "${i.title}" [${i.incidencia_type}] Estado: ${i.status}${i.deadline ? ` | Plazo: ${i.deadline}` : ""}${i.resolution_notes ? ` | Resolución: ${i.resolution_notes.substring(0, 100)}` : ""}`).join("\n")}`
      : "⚠️ NO HAY INCIDENCIAS REGISTRADAS. Evalúa si esto es realista o indica falta de sistema de gestión de incidencias.";

    // Audits context
    const auditsContext = audits.length > 0
      ? `Auditorías internas registradas: ${audits.length}
${audits.map((a: any) => `  - "${a.title}" | Estado: ${a.status} | Fecha: ${a.audit_date || "N/A"}${a.observations ? ` | Observaciones: ${a.observations.substring(0, 150)}` : ""}${a.findings ? ` | Hallazgos: ${a.findings.substring(0, 150)}` : ""}${a.conclusions ? ` | Conclusiones: ${a.conclusions.substring(0, 150)}` : ""}`).join("\n")}`
      : "⚠️ NO HAY AUDITORÍAS INTERNAS REGISTRADAS. La ausencia de programa de autoinspección es un incumplimiento.";

    // Reclamaciones context
    const openReclamaciones = reclamaciones.filter((r: any) => r.status !== "cerrada");
    const reclamacionesContext = reclamaciones.length > 0
      ? `Reclamaciones registradas: ${reclamaciones.length} (${openReclamaciones.length} abiertas)
Fuentes: ${[...new Set(reclamaciones.map((r: any) => r.source))].join(", ")}
${reclamaciones.slice(0, 15).map((r: any) => `  - "${r.title}" | Fuente: ${r.source} | Estado: ${r.status}${r.investigation ? ` | Investigación: ${r.investigation.substring(0, 100)}` : ""}${r.resolution ? ` | Resolución: ${r.resolution.substring(0, 100)}` : ""}`).join("\n")}`
      : "No hay reclamaciones registradas.";

    // Training context
    const completedTrainings = trainings.filter((t: any) => t.status === "completed" || t.status === "signed");
    const pendingTrainings = trainings.filter((t: any) => t.status === "draft" || t.status === "pending");
    const trainingContext = trainings.length > 0
      ? `Registros de formación: ${trainings.length} (Completadas: ${completedTrainings.length}, Pendientes: ${pendingTrainings.length})
${trainings.slice(0, 15).map((t: any) => `  - "${t.title}" | Estado: ${t.status}${t.deadline ? ` | Plazo: ${t.deadline}` : ""}`).join("\n")}`
      : "⚠️ NO HAY REGISTROS DE FORMACIÓN. La ausencia de programa de formación documentado es un incumplimiento significativo.";

    // Personnel context
    const personnelContext = profiles.length > 0
      ? `Personal registrado en el sistema: ${profiles.length} personas
Puestos identificados: ${[...new Set(profiles.map((p: any) => p.job_title).filter(Boolean))].join(", ") || "No especificados"}`
      : "No hay información de personal disponible.";

    const userPrompt = `SIMULACIÓN DE INSPECCIÓN OFICIAL para: "${companyName}"

═══════════════════════════════════════
DATOS DEL SISTEMA DE GESTIÓN DE CALIDAD
═══════════════════════════════════════

1. DOCUMENTACIÓN (${totalDocs} documentos aprobados)
Categorías presentes: ${docCategories.join(", ") || "Ninguna"}
Tipologías: ${docTypologies.join(", ") || "N/A"}

${docsContext}

2. INCIDENCIAS Y DESVIACIONES
${incidenciasContext}

3. AUDITORÍAS INTERNAS
${auditsContext}

4. RECLAMACIONES
${reclamacionesContext}

5. FORMACIÓN DEL PERSONAL
${trainingContext}

6. ORGANIZACIÓN
${personnelContext}

═══════════════════════════════════════
INSTRUCCIONES PARA EL INSPECTOR
═══════════════════════════════════════

Analiza TODA la información proporcionada como lo haría un inspector real durante una visita de inspección.

DEBES evaluar:
1. ¿La empresa tiene todos los documentos/SOPs/PNTs requeridos por la normativa? Identifica documentación faltante.
2. ¿Los documentos existentes cubren adecuadamente los procesos críticos?
3. ¿El sistema de gestión de incidencias/desviaciones es efectivo? ¿Se están cerrando a tiempo?
4. ¿Hay reclamaciones sin resolver o patrones preocupantes?
5. ¿Las auditorías internas son periódicas y tienen seguimiento?
6. ¿La formación del personal es adecuada y está documentada?
7. ¿Hay evidencia de CAPA efectivos?
8. ¿Se cumple con integridad de datos (si aplica)?
9. ¿Hay indicios de problemas sistémicos (incidencias recurrentes, mismos tipos de desviaciones)?

SÉ ESPECÍFICO: referencia documentos concretos del listado cuando sea posible (por código o título).
SÉ REALISTA: los hallazgos deben ser los que un inspector real identificaría con estos datos.
NO INVENTES datos que no están en el contexto, pero SÍ señala la AUSENCIA de información esperada.

Responde EXCLUSIVAMENTE en formato JSON válido con esta estructura:
{
  "summary": "Resumen ejecutivo detallado de la inspección simulada (mínimo 200 palabras), incluyendo impresión general, áreas de mayor riesgo y conclusión del inspector",
  "risk_score": <número 0-100 donde 0=sin riesgo y 100=riesgo máximo>,
  "findings": [
    {
      "severity": "critical|major|minor|observation",
      "category": "documentation|training|process_control|quality_assurance|validation|storage|equipment|complaints|capa|data_integrity",
      "finding_title": "Título claro y específico del hallazgo",
      "finding_description": "Descripción detallada explicando qué se encontró, por qué es un problema y cuál es el impacto potencial. Referencia documentos específicos cuando sea posible. Mínimo 50 palabras.",
      "regulation_reference": "Referencia normativa EXACTA y ESPECÍFICA (artículo, sección, párrafo). Ejemplo: '21 CFR 211.100(a)' o 'EU GMP Part I, Chapter 4.1' o 'RD 824/2010, Art. 15'",
      "recommendation": "Acción correctiva concreta y factible que la empresa debe implementar. Sé específico sobre qué hacer y en qué plazo.",
      "affected_area": "Área funcional afectada (ej: Control de Calidad, Producción, Almacén, Documentación, RRHH)"
    }
  ]
}

Genera entre 5 y 12 hallazgos realistas, proporcionales a los problemas identificados en los datos. La distribución de severidades debe ser realista.`;

    console.log("Sending request to AI with comprehensive company data...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("AI response received, parsing findings...");

    const parsed = JSON.parse(content);
    const findings = parsed.findings || [];

    // Match findings to actual documents when possible
    if (findings.length > 0) {
      const findingInserts = findings.map((f: any) => {
        // Try to match document_id from the finding description/title
        let documentId = null;
        if (documents?.length > 0) {
          const matchedDoc = documents.find((d: any) =>
            f.finding_description?.includes(d.code) ||
            f.finding_title?.includes(d.code) ||
            f.finding_description?.includes(d.title)
          );
          if (matchedDoc) documentId = matchedDoc.id;
        }

        return {
          simulation_id: simulationId,
          severity: f.severity,
          category: f.category,
          finding_title: f.finding_title,
          finding_description: f.finding_description,
          regulation_reference: f.regulation_reference,
          recommendation: f.recommendation,
          affected_area: f.affected_area,
          document_id: documentId,
        };
      });

      await supabase.from("audit_findings").insert(findingInserts);
    }

    const critical = findings.filter((f: any) => f.severity === "critical").length;
    const major = findings.filter((f: any) => f.severity === "major").length;
    const minor = findings.filter((f: any) => f.severity === "minor").length;

    await supabase
      .from("audit_simulations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        summary: parsed.summary,
        risk_score: parsed.risk_score,
        total_findings: findings.length,
        critical_findings: critical,
        major_findings: major,
        minor_findings: minor,
      })
      .eq("id", simulationId);

    console.log("Audit simulation completed with", findings.length, "findings");

    return new Response(
      JSON.stringify({ success: true, findingsCount: findings.length, riskScore: parsed.risk_score }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Audit simulation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
