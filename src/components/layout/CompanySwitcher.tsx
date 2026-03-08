import { Building2, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export function CompanySwitcher() {
  const { isRootAdmin } = useAuth();
  const { activeCompany, companies, switchCompany } = useCompanyContext();

  if (!isRootAdmin || companies.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {activeCompany && (
        <Badge variant="outline" className="border-primary/40 text-primary text-xs gap-1">
          <Building2 className="w-3 h-3" />
          {activeCompany.name}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void switchCompany(null);
            }}
            className="ml-1 hover:text-destructive"
          >
            <X className="w-3 h-3" />
          </button>
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground text-xs h-8">
            <Building2 className="w-4 h-4" />
            {!activeCompany && "Mi empresa"}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover max-h-64 overflow-y-auto w-56">
          <DropdownMenuItem
            onSelect={() => void switchCompany(null)}
            className={`cursor-pointer text-sm ${!activeCompany ? "font-semibold text-primary" : ""}`}
          >
            Mi empresa (propia)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {companies.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={() => void switchCompany(c.id)}
              className={`cursor-pointer text-sm ${activeCompany?.id === c.id ? "font-semibold text-primary" : ""}`}
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
    </div>
  );
}
