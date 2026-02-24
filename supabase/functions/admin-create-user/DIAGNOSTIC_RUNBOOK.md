# admin-create-user — diagnóstico de 403 NOT_SUPERADMIN

## 1) Activar modo diagnóstico (temporal)
Configura estas variables en el entorno de la Edge Function:

- `DEBUG_USER_CREATION=true`
- `INCLUDE_DEBUG_IN_RESPONSE=true`

Opcionales controlados:

- `BOOTSTRAP_ALIGN_PROFILE_ID=true` para alinear `profiles.id` con `auth.users.id` cuando el fallback por email sea superadmin y único.
- `BOOTSTRAP_SUPERADMIN=true` **solo** para recuperación de `admin@admin.com`.

## 2) Reproducir y capturar evidencia
Desde UI (o cliente API), invoca `admin-create-user` y captura:

1. `x-request-id` enviado/recibido.
2. URL de la request (para confirmar proyecto/entorno).
3. JSON `error.debug` de la respuesta (si falla).
4. Logs de la función filtrados por `requestId`.

## 3) Interpretación rápida
Usa `decision` + campos de debug:

- `MISSING_AUTH`: no llegó header `Authorization`.
- `INVALID_TOKEN`: token inválido o formato incorrecto.
- `TOKEN_RUNTIME_MISMATCH`: `tokenClaims.sub/email` no coincide con `caller.id/email`.
- `PROJECT_ENV_MISMATCH_SUSPECTED`: host del issuer del token distinto a `projectHost` de la función.
- `PROFILE_BY_ID_MISSING`: no existe `profiles.id = callerId`.
- `PROFILE_BY_ID_SUPERADMIN_FALSE`: perfil existe por id pero sin privilegio.
- `PROFILE_EMAIL_FALLBACK_SUPERADMIN_TRUE`: solo existe superadmin por email (migración legacy posible).
- `PROFILE_EMAIL_FALLBACK_NOT_ALLOWED`: fallback por email no autorizable (no superadmin o inexistente).
- `PROFILE_AMBIGUOUS_EMAIL`: `profiles` tiene más de un registro con el mismo email normalizado.

## 4) Matriz de clasificación raíz

| Señales observadas | Clasificación raíz probable |
| --- | --- |
| `decision=PROJECT_ENV_MISMATCH_SUSPECTED` y `tokenProjectHost != projectHost` | Frontend apuntando a otro proyecto/entorno o token emitido por otro proyecto |
| `decision=MISSING_AUTH` o `hasAuthHeader=false` | Header de autorización no enviado |
| `decision=INVALID_TOKEN` | Token expirado/inválido/prefijo incorrecto |
| `decision=TOKEN_RUNTIME_MISMATCH` con `tokenSubMatchesCaller=false` | Token/cabecera inconsistente, sesión stale o mezcla runtime-token |
| `decision=PROFILE_BY_ID_MISSING` + `profileByEmailSuperadmin=true` | Desalineación legacy (`profiles.id` distinto de `auth.users.id`) |
| `decision=PROFILE_BY_ID_SUPERADMIN_FALSE` | Perfil correcto por id, flag `is_superadmin` en `false` |
| `decision=PROFILE_AMBIGUOUS_EMAIL` + `profileEmailCount>1` | Datos inconsistentes: email duplicado en `profiles` |
| `functionVersion` inesperada | Despliegue stale (versión de función no actualizada) |

## 5) SQL de validación/reparación
Usa el script `scripts/diagnose_superadmin_profile.sql` para validar y reparar `profiles` por `callerId` y email.
