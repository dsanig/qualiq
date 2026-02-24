-- Uso:
--   1) Reemplaza los placeholders de callerId y callerEmail.
--   2) Ejecuta en SQL editor del mismo proyecto Supabase al que apunta la función.

-- Parámetros esperados (edita manualmente):
--   callerId: UUID devuelto en debug.callerId
--   callerEmail: email devuelto en debug.callerEmail

-- Diagnóstico por id y email normalizado
select id, email, is_superadmin
from profiles
where id = '00000000-0000-0000-0000-000000000000'::uuid;

select id, email, is_superadmin
from profiles
where lower(email) = lower('admin@example.com');

select count(*) as duplicated_email_count
from profiles
where lower(email) = lower('admin@example.com');

-- Reparación mínima por callerId (strict server-side remains in function)
insert into profiles (id, email, is_superadmin)
values ('00000000-0000-0000-0000-000000000000'::uuid, lower('admin@example.com'), true)
on conflict (id)
do update set
  email = excluded.email,
  is_superadmin = true;
