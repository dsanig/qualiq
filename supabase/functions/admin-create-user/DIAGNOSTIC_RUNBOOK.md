# admin-create-user diagnostic runbook

## 1) Enable diagnostics
Set function env vars:

- `DEBUG_USER_CREATION=true`
- `INCLUDE_DEBUG_IN_RESPONSE=true`
- Optional: `BOOTSTRAP_ALIGN_PROFILE_ID=true` (align legacy profile id/email mismatch automatically)

## 2) Deployment-proof check
Invoke `POST /functions/v1/admin-create-user` and verify response headers include:

- `x-function-version: admin-create-user@authdiag-001`
- `x-request-id: ...`

If `x-function-version` is missing, request is not hitting updated code/project.

## 3) Read deterministic denial reason
For denied calls (`403`), inspect:

- JSON `error.details.decision`
- Header `x-debug-decision` (when `INCLUDE_DEBUG_IN_RESPONSE=true`)
- Headers `x-debug-caller-email` and `x-debug-caller-id` (safe diagnostics only)

Expected 403 decisions:

- `NOT_SUPERADMIN_BY_ID`
- `NOT_SUPERADMIN_BY_EMAIL`
- `PROFILE_MISSING`
- `PROFILE_SUPERADMIN_FALSE`
- `AUTH_MISSING`
- `AUTH_INVALID`
- `ENV_MISMATCH_SUSPECTED`
- `UNKNOWN`

## 4) Fix admin profile (operator SQL)
Use caller id from debug header/payload and run:

```sql
insert into public.profiles (id, email, is_superadmin)
values ('<callerId>'::uuid, 'admin@admin.com', true)
on conflict (id)
do update set
  is_superadmin = true,
  email = excluded.email;
```

## 5) Verification checklist
1. Keep `INCLUDE_DEBUG_IN_RESPONSE=true` temporarily.
2. Call from UI as `admin@admin.com`.
3. Verify headers show the function version and debug decision.
4. Confirm `admin@admin.com` returns `201`.
5. Call as non-superadmin and confirm `403` with decision starting with `NOT_SUPERADMIN...`.
