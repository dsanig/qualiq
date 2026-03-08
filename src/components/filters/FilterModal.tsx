import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FiltersState = {
  category: string;
  documentTypology: "all" | "Proceso" | "PNT" | "Documento" | "Normativa" | "Otro";
  documentStatus: string;
  signatureStatus: string;
  incidentType: string;
  incidentStatus: string;
};

interface FilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
  activeModule?: string;
}

export function FilterModal({ open, onOpenChange, filters, onFiltersChange }: FilterModalProps) {
  const updateFilter = (key: keyof FiltersState, value: string) => {
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
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear filtros</DialogTitle>
          <DialogDescription>
            Define criterios de filtrado que se aplicarán en Documentos e Incidencias.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          <div className="space-y-2">
            <Label>Tipología (Documentos)</Label>
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
                <SelectItem value="review">En revisión</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="obsolete">Obsoleto</SelectItem>
                <SelectItem value="archived">Archivado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Estado de firma (Documentos)</Label>
            <Select value={filters.signatureStatus} onValueChange={(value) => updateFilter("signatureStatus", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona estado de firma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente de firma</SelectItem>
                <SelectItem value="signed">Firmado</SelectItem>
                <SelectItem value="not_required">No requiere firma</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo (Incidencias)</Label>
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
            <Label>Estado (Incidencias)</Label>
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
