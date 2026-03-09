import { useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, FileText, AlertTriangle, ClipboardCheck, GraduationCap, MessageSquare, TrendingUp, CalendarDays, FileWarning, Shield, Building2, Settings, Search, Bell, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const modules = [
  {
    icon: LayoutDashboard,
    title: "Panel de Control",
    description:
      "Vista general del estado de tu sistema de calidad. Muestra indicadores clave como documentos activos, incidencias abiertas, acciones en curso y porcentaje de SOPs aprobados. Desde aquí puedes acceder rápidamente a cualquier módulo y visualizar las tareas pendientes.",
  },
  {
    icon: CalendarDays,
    title: "Calendario",
    description:
      "Visualiza de forma cronológica todas las fechas relevantes: vencimientos de documentos, plazos de incidencias, fechas de auditorías y formaciones programadas. Permite planificar y anticiparse a los hitos del sistema de calidad.",
  },
  {
    icon: FileText,
    title: "Gestión Documental",
    description:
      "Gestiona el ciclo de vida completo de tus documentos: creación, revisión, aprobación y obsolescencia. Soporta control de versiones (mayor y menor), firma electrónica, asignación de responsables y compartición mediante enlaces seguros con caducidad. Compatible con múltiples formatos (PDF, Word, Excel, imágenes).",
  },
  {
    icon: AlertTriangle,
    title: "Incidencias",
    description:
      "Registra y da seguimiento a desviaciones, no conformidades y eventos de calidad. Cada incidencia pasa por un flujo de estados (Abierta → En Progreso → Cerrada) controlado por el responsable asignado. Permite adjuntar evidencias, definir plazos y vincular con planes CAPA.",
  },
  {
    icon: FileWarning,
    title: "Reclamaciones",
    description:
      "Módulo dedicado a la gestión de reclamaciones de clientes, proveedores u otros orígenes. Incluye campos para investigación interna, resolución y conclusión. Permite trazabilidad bidireccional con incidencias y sigue un flujo propio de estados (Abierta → En Revisión → En Resolución → Cerrada).",
  },
  {
    icon: ClipboardCheck,
    title: "Auditorías y CAPA",
    description:
      "Planifica y ejecuta auditorías internas o externas. Registra hallazgos, observaciones y conclusiones. Genera planes CAPA (Acciones Correctivas y Preventivas) vinculados a las auditorías, con seguimiento de no conformidades y acciones individuales con responsables y fechas límite.",
  },
  {
    icon: GraduationCap,
    title: "Formaciones",
    description:
      "Crea registros de formación vinculados a documentos del sistema de calidad. Asigna participantes, adjunta materiales de soporte y recoge firmas de los asistentes y formadores. Útil para demostrar la capacitación del personal ante auditorías.",
  },
  {
    icon: GraduationCap,
    title: "Examen de Formación",
    description:
      "Genera exámenes automáticos basados en el contenido de los documentos del sistema. Utiliza inteligencia artificial para crear preguntas de evaluación que verifican la comprensión del personal sobre los procedimientos documentados.",
  },
  {
    icon: ClipboardCheck,
    title: "Simulador de Auditoría",
    description:
      "Herramienta con IA que simula una auditoría sobre tu sistema documental. Analiza tus documentos, detecta posibles hallazgos y genera un informe con puntuación de riesgo, hallazgos críticos, mayores y menores, junto con recomendaciones de mejora.",
  },
  {
    icon: TrendingUp,
    title: "Análisis Predictivo",
    description:
      "Módulo de inteligencia que analiza patrones en tus datos de calidad (incidencias, acciones, documentos) para detectar tendencias y generar alertas proactivas. Ayuda a anticiparse a problemas recurrentes antes de que se conviertan en hallazgos de auditoría.",
  },
  {
    icon: MessageSquare,
    title: "QualAI – Asistente Inteligente",
    description:
      "Chatbot especializado en calidad que responde preguntas sobre normativas, buenas prácticas y el propio sistema. Puede ayudarte a redactar procedimientos, interpretar requisitos regulatorios o resolver dudas sobre flujos de trabajo.",
  },
];

const generalFeatures = [
  {
    icon: Search,
    title: "Búsqueda global",
    description: "Busca documentos, incidencias o cualquier registro desde la barra superior.",
  },
  {
    icon: Bell,
    title: "Notificaciones",
    description: "Recibe alertas sobre tareas pendientes, cambios de estado y vencimientos próximos.",
  },
  {
    icon: Shield,
    title: "Seguridad y Audit Trail",
    description: "Todas las acciones quedan registradas con trazabilidad completa (quién, qué, cuándo). Compatible con 21 CFR Part 11. Soporte para autenticación de dos factores (2FA).",
  },
  {
    icon: Users,
    title: "Roles y permisos",
    description: "El sistema gestiona permisos por roles (Administrador, Editor, Espectador). Cada rol define qué puede ver, crear o modificar dentro de la plataforma.",
  },
  {
    icon: Building2,
    title: "Gestión multiempresa",
    description: "Los superadministradores pueden gestionar múltiples organizaciones y alternar entre ellas sin cerrar sesión.",
  },
];

export default function Tutorial() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-4xl mx-auto flex items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Guía de uso</h1>
            <p className="text-sm text-muted-foreground">Tutorial completo de la plataforma</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        {/* Intro */}
        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-foreground">¿Qué es QualiQ?</h2>
          <p className="text-muted-foreground leading-relaxed">
            QualiQ es una plataforma integral de gestión de calidad diseñada para empresas que necesitan cumplir con normativas regulatorias (ISO 9001, ISO 13485, GMP, 21 CFR Part 11, entre otras). Centraliza la gestión documental, el seguimiento de incidencias y reclamaciones, la planificación de auditorías y la formación del personal en un único entorno digital seguro y trazable.
          </p>
        </section>

        <Separator />

        {/* Modules */}
        <section className="space-y-5">
          <h2 className="text-2xl font-bold text-foreground">Módulos principales</h2>
          <div className="grid gap-4">
            {modules.map((mod) => (
              <Card key={mod.title} className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <mod.icon className="h-5 w-5" />
                    </div>
                    {mod.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{mod.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* General features */}
        <section className="space-y-5">
          <h2 className="text-2xl font-bold text-foreground">Funcionalidades generales</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {generalFeatures.map((feat) => (
              <Card key={feat.title} className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <feat.icon className="h-5 w-5 text-accent" />
                    {feat.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* Workflow */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Flujo de trabajo general</h2>
          <ol className="space-y-3 list-decimal list-inside text-sm text-muted-foreground leading-relaxed">
            <li><strong className="text-foreground">Documenta</strong> — Crea y aprueba los procedimientos y documentos que rigen tu sistema de calidad.</li>
            <li><strong className="text-foreground">Forma</strong> — Capacita al personal sobre los documentos aprobados y verifica su comprensión con exámenes.</li>
            <li><strong className="text-foreground">Opera</strong> — Registra incidencias y reclamaciones cuando surjan desviaciones en los procesos.</li>
            <li><strong className="text-foreground">Audita</strong> — Planifica auditorías periódicas y ejecuta simulaciones para detectar áreas de mejora.</li>
            <li><strong className="text-foreground">Mejora</strong> — Crea planes CAPA para abordar las causas raíz y prevenir la recurrencia de problemas.</li>
            <li><strong className="text-foreground">Analiza</strong> — Utiliza el análisis predictivo y QualAI para identificar tendencias y optimizar tu sistema.</li>
          </ol>
        </section>

        {/* Footer */}
        <div className="pt-4 pb-12 text-center">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a la aplicación
          </Button>
        </div>
      </div>
    </div>
  );
}
