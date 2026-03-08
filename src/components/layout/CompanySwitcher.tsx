import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export function CompanySwitcher() {
  const { isRootAdmin } = useAuth();
  const { activeCompany, companies, switchCompany, effectiveCompanyId } = useCompanyContext();

  if (!isRootAdmin || companies.length === 0) return null;

  const currentName = activeCompany?.name ?? companies.find((c) => c.id === effectiveCompanyId)?.name ?? "Empresa";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground text-xs h-8">
          <Building2 className="w-4 h-4" />
          <span className="max-w-[140px] truncate">{currentName}</span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover max-h-64 overflow-y-auto w-56">
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => void switchCompany(c.id)}
            className={`cursor-pointer text-sm ${c.id === effectiveCompanyId ? "font-semibold text-primary" : ""}`}
          >
            <span className="truncate">{c.name}</span>
            {c.status !== "active" && (
              <Badge variant="secondary" className="ml-auto text-[10px] scale-90">
                {c.status}
              </Badge>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}