# Hotfix: columna `typology` en `public.documents`

## 1) Verificar proyecto Supabase objetivo

La app usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PROJECT_ID` para conectarse. Antes de guardar documentos en desarrollo ahora se imprime:

```ts
console.log("SUPABASE_HOST", new URL(import.meta.env.VITE_SUPABASE_URL).host)
```

Debes confirmar que ese host coincide con el proyecto donde aplicarás la migración.

## 2) Verificar esquema real (en el mismo proyecto)

Ejecuta en SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='documents'
ORDER BY ordinal_position;
```

## 3) Aplicar migración

Migración incluida en repo:

- `supabase/migrations/20260305130500_add_documents_typology.sql`

Opciones de despliegue:

1. Con Supabase CLI (recomendado):
   - `supabase link --project-ref <project-ref-correcto>`
   - `supabase db push`
2. Sin CLI:
   - Copia y ejecuta el SQL de la migración en SQL Editor del proyecto correcto.

## 4) Validación posterior

Vuelve a ejecutar:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='documents'
ORDER BY ordinal_position;
```

Y comprueba que exista `typology`.

## 5) Valores permitidos

La integridad queda protegida con `CHECK` y frontend alineado para enviar exactamente:

- `Proceso`
- `PNT`
- `Documento`
- `Normativa`
- `Otro`

## 6) Fallback temporal ante desajuste de despliegue

Si el frontend se despliega antes que la migración y aparece el error de schema cache de `typology`:

- Se cancela el guardado y se muestra: `El sistema aún no está actualizado. Intenta más tarde.`

Esto evita guardar datos inconsistentes hasta que termine el despliegue de BD.
