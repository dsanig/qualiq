-- Replace placeholders from diagnostic headers/payload.

-- 1) Inspect by id
select id, email, is_superadmin
from public.profiles
where id = '<callerId>'::uuid;

-- 2) Inspect by email
select id, email, is_superadmin
from public.profiles
where lower(email) = lower('admin@admin.com');

-- 3) Ensure admin caller profile is authoritative by id
insert into public.profiles (id, email, is_superadmin)
values ('<callerId>'::uuid, 'admin@admin.com', true)
on conflict (id)
do update set
  is_superadmin = true,
  email = excluded.email;
