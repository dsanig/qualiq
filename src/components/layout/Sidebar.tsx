import { 
  LayoutDashboard, 
  FileText, 
  AlertTriangle, 
  MessageSquare, 
  Settings,
  ChevronLeft,
  Building2,
  GraduationCap,
  ClipboardCheck,
  TrendingUp,
  FileWarning,
  Globe,
  CalendarDays,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  enabledFeatures?: Set<string>;
  isSuperadmin?: boolean;
  isAdmin?: boolean;
}

const navigationItems = [
  { id: "dashboard", label: "Panel de Control", icon: LayoutDashboard },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "documents", label: "Documentos", icon: FileText },
  { id: "incidents", label: "Incidencias", icon: AlertTriangle },
  { id: "reclamaciones", label: "Reclamaciones", icon: FileWarning },
  { id: "audits", label: "Auditorías y CAPA", icon: ClipboardCheck },
  { id: "training", label: "Formaciones", icon: GraduationCap },
  { id: "training-exam", label: "Examen Formación", icon: GraduationCap },
  { id: "audit-simulator", label: "Simulador Auditoría", icon: ClipboardCheck },
  { id: "predictive-analytics", label: "Análisis Predictivo", icon: TrendingUp },
  { id: "chatbot", label: "QualAI", icon: MessageSquare },
];

const bottomItems = [
  { id: "company", label: "Empresa", icon: Building2 },
  { id: "settings", label: "Configuración", icon: Settings },
];

const superadminItems = [
  { id: "company-management", label: "Gestión Empresas", icon: Globe },
];

const adminItems = [
  { id: "audit-trail", label: "Pista de Auditoría", icon: Shield },
];

export function Sidebar({ activeModule, onModuleChange, collapsed = false, onToggle, enabledFeatures, isSuperadmin = false, isAdmin = false }: SidebarProps) {
  const visibleNavItems = enabledFeatures
    ? navigationItems.filter((item) => item.id === "dashboard" || item.id === "calendar" || enabledFeatures.has(item.id))
    : navigationItems;

  return (
    <aside 
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground h-screen transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center">
            <img src="/iQ_V1.svg" alt="QualiQ logo" className="w-5 h-5" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg tracking-tight">QualiQ<span className="text-xs font-normal italic text-muted-foreground">, by INMEDSA</span></span>
          )}
        </div>
        {onToggle && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggle}
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onModuleChange(item.id)}
            className={cn(
              "nav-item w-full",
              activeModule === item.id && "nav-item-active"
            )}
            data-testid={`sidebar-${item.id}`}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Superadmin Section */}
      {isSuperadmin && (
        <div className="px-3 py-2 border-t border-sidebar-border space-y-1">
          {superadminItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onModuleChange(item.id)}
              className={cn(
                "nav-item w-full",
                activeModule === item.id && "nav-item-active"
              )}
              data-testid={`sidebar-${item.id}`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onModuleChange(item.id)}
            className={cn(
              "nav-item w-full",
              activeModule === item.id && "nav-item-active"
            )}
            data-testid={`sidebar-${item.id}`}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>

    </aside>
  );
}
