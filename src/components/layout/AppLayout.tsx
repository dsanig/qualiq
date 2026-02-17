import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppLayoutProps {
  children: React.ReactNode;
  activeModule: string;
  onModuleChange: (module: string) => void;
  title: string;
  subtitle?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  enabledFeatures?: Set<string>;
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
  enabledFeatures,
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
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={title}
          subtitle={subtitle}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
