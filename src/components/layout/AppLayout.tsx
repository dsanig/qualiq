import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export interface AppLayoutProps {
  children: React.ReactNode;
  activeModule: string;
  onModuleChange: (module: string) => void;
  title: string;
  subtitle?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  onSearchClear?: () => void;
  searchPlaceholder?: string;
  enabledFeatures?: Set<string>;
  isSuperadmin?: boolean;
}

export function AppLayout({
  children,
  activeModule,
  onModuleChange,
  title,
  subtitle,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onSearchSubmit,
  onSearchClear,
  enabledFeatures,
  isSuperadmin,
}: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar 
        activeModule={activeModule}
        onModuleChange={onModuleChange}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        enabledFeatures={enabledFeatures}
        isSuperadmin={isSuperadmin}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={title}
          subtitle={subtitle}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          onSearchSubmit={onSearchSubmit}
          onSearchClear={onSearchClear}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
