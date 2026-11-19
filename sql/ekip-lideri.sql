-- Haftalık Plan: ekip lideri rolü
-- Supabase > SQL Editor'a yapıştırın, 1. adımdaki e-postayı kendi giriş e-postanızla değiştirin ve "Run" deyin.
-- Mevcut planlar silinmez. Birden fazla çalıştırmak güvenlidir.
-- "Planlara ekip arkadaşı ekleme" SQL'inden önce ya da sonra çalıştırılabilir.

-- 0) Lider bayrağı
alter table public.profiles add column if not exists is_leader boolean not null default false;

create or replace function public.is_leader()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select is_leader and is_member from public.profiles where id = auth.uid()), false) $$;
revoke all on function public.is_leader() from public, anon;
grant execute on function public.is_leader() to authenticated;

-- Kullanıcılar kendi üyelik/lider bayrağını uygulamadan değiştiremesin
create or replace function public.protect_member_flag()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.is_member := old.is_member;
    new.is_leader := old.is_leader;
  end if;
  return new;
end $$;

-- 1) İlk lider: kendi giriş e-postanızı yazın (ikinci lideri uygulamadan atayabilirsiniz)
update public.profiles set is_leader = true
where is_member and id in (select id from auth.users where lower(email) = lower('BURAYA-EPOSTANIZ@ornek.com'));

-- 2) Lider, ekipteki herkesin "Ekip de görsün" planlarını düzenleyip silebilir
--    (mevcut "kendi planın" kurallarına ek; gizli planlara dokunamaz)
drop policy if exists "plans update leader" on public.plans;
create policy "plans update leader" on public.plans for update to authenticated
  using ((select public.is_leader()) and not is_private and public.user_is_member(user_id))
  with check ((select public.is_leader()) and public.user_is_member(user_id));
drop policy if exists "plans delete leader" on public.plans;
create policy "plans delete leader" on public.plans for delete to authenticated
  using ((select public.is_leader()) and not is_private and public.user_is_member(user_id));

-- 3) Lider bir üyeyi ekipten çıkarır; delete_account = true ise hesabı ve tüm planları da silinir
create or replace function public.remove_member(target uuid, delete_account boolean default false)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_leader() then raise exception 'Bunu sadece ekip lideri yapabilir'; end if;
  if target = auth.uid() then raise exception 'Kendini çıkaramazsın'; end if;
  if exists (select 1 from public.profiles where id = target and is_leader) then
    raise exception 'Önce bu kişinin liderliğini kaldır';
  end if;
  -- başkalarının planlarındaki katılımcı listesinden de çıkar (sütun varsa)
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'plans' and column_name = 'participants') then
    execute 'update public.plans set participants = array_remove(participants, $1) where $1 = any(participants)' using target;
  end if;
  if delete_account then
    delete from auth.users where id = target; -- profil ve planlar da silinir
  else
    update public.profiles set is_member = false, is_leader = false where id = target;
  end if;
  return found;
end $$;
revoke all on function public.remove_member(uuid, boolean) from public, anon;
grant execute on function public.remove_member(uuid, boolean) to authenticated;

-- 4) Lider başka bir üyeyi lider yapar ya da liderliğini kaldırır (son lider kendini kaldıramaz)
create or replace function public.set_leader(target uuid, val boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_leader() then raise exception 'Bunu sadece ekip lideri yapabilir'; end if;
  if not public.user_is_member(target) then raise exception 'Bu kişi ekipte değil'; end if;
  if not val and (select count(*) from public.profiles where is_leader and is_member and id <> target) = 0 then
    raise exception 'Ekipte en az bir lider kalmalı';
  end if;
  update public.profiles set is_leader = val where id = target;
  return found;
end $$;
revoke all on function public.set_leader(uuid, boolean) from public, anon;
grant execute on function public.set_leader(uuid, boolean) to authenticated;

-- Kontrol: ekip listesi (lider sütunu "true" olan sizsiniz)
select p.full_name as ad, u.email as eposta, p.is_member as ekipte, p.is_leader as lider
from public.profiles p join auth.users u on u.id = p.id
order by p.is_leader desc, p.created_at;
