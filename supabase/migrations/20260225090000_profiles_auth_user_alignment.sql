-- Ensure profiles.id is always aligned with auth.users.id.

alter table public.profiles
drop constraint if exists profiles_id_fkey;

alter table public.profiles
add constraint profiles_id_fkey
foreign key (id)
references auth.users(id)
on delete cascade;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, is_superadmin)
  values (new.id, lower(new.email), false)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

update public.profiles
set is_superadmin = true
where lower(email) = 'admin@admin.com';
