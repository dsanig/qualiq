import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export type FiltersState = {
  category: string;
  documentTypology: "all" | "Proceso" | "PNT" | "Documento" | "Normativa" | "Otro";
  documentStatus: string;
  signatureStatus: string;
  incidentType: string;
  incidentStatus: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

interface FilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
  activeModule?: string;
}

export function FilterModal({ open, onOpenChange, filters, onFiltersChange, activeModule }: FilterModalProps) {
  const updateFilter = (key: keyof FiltersState, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const handleReset = () => {
    onFiltersChange({
      category: "all",
      documentTypology: "all",
      documentStatus: "all",
      signatureStatus: "all",
      incidentType: "all",
      incidentStatus: "all",
      dateFrom: null,
      dateTo: null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Filtros</DialogTitle>
          <DialogDescription>
            Filtra los resultados del módulo actual.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {/* Document filters */}
          {(!activeModule || activeModule === "documents") && (
            <>
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={filters.category} onValueChange={(value) => updateFilter("category", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="calidad">Calidad</SelectItem>
                    <SelectItem value="produccion">Producción</SelectItem>
                    <SelectItem value="logistica">Logística</SelectItem>
                    <SelectItem value="rrhh">RRHH</SelectItem>
                    <SelectItem value="regulatory">Regulatorio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipología</Label>
                <Select value={filters.documentTypology} onValueChange={(value) => updateFilter("documentTypology", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una tipología" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="Proceso">Proceso</SelectItem>
                    <SelectItem value="PNT">PNT</SelectItem>
                    <SelectItem value="Documento">Documento</SelectItem>
                    <SelectItem value="Normativa">Normativa</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Estado del documento</Label>
                <Select value={filters.documentStatus} onValueChange={(value) => updateFilter("documentStatus", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="approved">Aprobado</SelectItem>
                    <SelectItem value="review">En Revisión</SelectItem>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="pending_signature">Pendiente de Firma</SelectItem>
                    <SelectItem value="pending_approval">Pendiente de Aprobación</SelectItem>
                    <SelectItem value="obsolete">Denegado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Última actualización (desde)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filters.dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateFrom ? format(filters.dateFrom, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                      {filters.dateFrom && (
                        <X
                          className="ml-auto h-4 w-4 opacity-50 hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); updateFilter("dateFrom", null); }}
                        />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom ?? undefined}
                      onSelect={(date) => updateFilter("dateFrom", date ?? null)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Última actualización (hasta)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filters.dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateTo ? format(filters.dateTo, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                      {filters.dateTo && (
                        <X
                          className="ml-auto h-4 w-4 opacity-50 hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); updateFilter("dateTo", null); }}
                        />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateTo ?? undefined}
                      onSelect={(date) => updateFilter("dateTo", date ?? null)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}

          {/* Incident filters */}
          {activeModule === "incidents" && (
            <>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={filters.incidentType} onValueChange={(value) => updateFilter("incidentType", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="incidencia">Incidencia</SelectItem>
                    <SelectItem value="desviacion">Desviación</SelectItem>
                    <SelectItem value="no_conformidad">No Conformidad</SelectItem>
                    <SelectItem value="otra">Otra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={filters.incidentStatus} onValueChange={(value) => updateFilter("incidentStatus", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="in_progress">En progreso</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleReset}>
            Restablecer filtros
          </Button>
          <Button variant="accent" onClick={() => onOpenChange(false)}>
            Aplicar filtros
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
