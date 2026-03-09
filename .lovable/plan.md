
## Plan: Hacer título, descripción y severidad obligatorios en No Conformidades

### Cambios a realizar en `src/components/audit/NcCapaManagementView.tsx`

**1. Actualizar validación en `createNc()` (líneas 360-364)**
- Añadir validación para `ncForm.title`, `ncForm.description` y `ncForm.severity`
- Mensaje de error actualizado: "Título, descripción, severidad, responsable y fecha límite son obligatorios."

**2. Actualizar validación en `updateNc()` (líneas 397-402)**
- Añadir misma validación para título, descripción y severidad

**3. Eliminar opción "Sin severidad" en el diálogo de creación (líneas 1178-1185)**
- Eliminar `<SelectItem value="none">Sin severidad</SelectItem>`
- Cambiar `value={ncForm.severity || "none"}` a `value={ncForm.severity}`
- Ajustar `onValueChange` para no manejar "none"

**4. Eliminar opción "Sin severidad" en el diálogo de edición (líneas 1233-1241)**
- Mismos cambios que en el diálogo de creación

**5. Actualizar labels de los campos**
- Cambiar `<Label>Descripción</Label>` a `<Label>Descripción *</Label>`
- Cambiar `<Label>Severidad</Label>` a `<Label>Severidad *</Label>`

### Resumen técnico
```typescript
// Validación actualizada
if (!ncForm.title || !ncForm.description || !ncForm.severity || !ncForm.responsible_id || !ncForm.deadline) {
  toast({ title: "Error", description: "Título, descripción, severidad, responsable y fecha límite son obligatorios.", variant: "destructive" });
  return;
}

// Selector sin opción "none"
<Select value={ncForm.severity} onValueChange={(v) => setNcForm((p) => ({ ...p, severity: v }))}>
  <SelectTrigger><SelectValue placeholder="Selecciona severidad" /></SelectTrigger>
  <SelectContent>
    {severityLevels.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
  </SelectContent>
</Select>
```
