# Política de datos reales (sin demo en producción)

## Reglas
- No se permite usar `demoData`, `mockData`, `faker` ni fallbacks ficticios en runtime de producción.
- Los módulos críticos (`dashboard`, `analytics`, `analyze-capa-patterns`) deben consumir solo Supabase (DB/RPC/Storage).
- Si no hay datos suficientes, la UI debe mostrar estado vacío y guiar al usuario para cargar datos reales.

## Guardrail técnico
- Script: `npm run guard:no-demo-data`
- Este script falla si detecta patrones demo/mock prohibidos en módulos críticos.

## Datos de ejemplo
- Si se necesitan datos de ejemplo, deben existir únicamente en entornos dev/storybook aislados.
- Está prohibido importar esos datos desde código que forme parte del bundle de producción.
