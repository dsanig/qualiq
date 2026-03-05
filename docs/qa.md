# Manual QA Checklist · QMS/DMS Documentos

1. Crear documento nuevo (código, título, categoría, archivo) y confirmar inserción.
2. Abrir **Responsables** de la versión actual y asignar al menos:
   - 1 responsabilidad de `revision`
   - 1 responsabilidad de `aprobacion`
   - (opcional) `firma`
3. Abrir **Cambiar estado** y pasar de BORRADOR a EN_REVISION.
4. Intentar firmar como usuario no responsable (`FIRMA`) y verificar que falla por permisos.
5. Firmar como usuario responsable con:
   - Firma DNIe (método `DNIE`)
   - Firma por nombre (método `NOMBRE`)
6. Aprobar versión (`EN_REVISION` -> `APROBADO`) solo cuando las responsabilidades estén completadas.
7. Crear nueva versión desde **Actualizar versión**:
   - Debe exigir `change_summary`.
   - Debe exigir nuevos responsables.
   - Debe crear nueva versión y obsoletar la anterior automáticamente.
8. Revisar **Historial de versiones**:
   - Mostrar estados (`BORRADOR`, `EN_REVISION`, `APROBADO`, `OBSOLETO`).
   - Mostrar `changes_description`/`change_summary`.
9. Verificar que versión obsoleta sigue siendo descargable, pero no editable/firmable.
10. Verificar registros en `document_audit_log` para:
    - Asignación/remoción de responsables.
    - Firma.
    - Cambio de estado.
    - Creación de nueva versión.
