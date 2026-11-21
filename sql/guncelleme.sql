-- Haftalık Plan: yeni özellikler için TEK SEFERLİK güncelleme
-- (plana ekip arkadaşı ekleme + ekip lideri rolü)
-- Supabase > SQL Editor'a tamamını yapıştırıp "Run" deyin.
-- Mevcut planlar ve üyeler silinmez. Birden fazla çalıştırmak güvenlidir.
-- Ekipte henüz lider yoksa, ekibe İLK katılan üye otomatik lider yapılır
-- (en alttaki listede kimin lider olduğunu görürsünüz; uygulamadan değiştirilebilir).


-- 1) Plana dahil edilen ekip arkadaşları (plan sahibi hariç)
alter table public.plans add column if not exists participants uuid[] not null default '{}';
create index if not exists plans_participants_idx on public.plans using gin (participants);

-- 2) Katılımcı listesini temizle: sadece ekip üyeleri, tekrar yok, sahibi listede yok.
--    Sadece plan sahibi katılımcı ekleyip çıkarabilir (katılımcı kendini "ayrıl" ile çıkarır).
create or replace function public.clean_participants()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.user_is_member(new.user_id) then
    new.participants := '{}';
  else
    new.participants := coalesce((
      select array_agg(distinct p)
      from unnest(coalesce(new.participants, '{}')) p
      where p <> new.user_id and public.user_is_member(p)
    ), '{}');
  end if;
  return new;
end $$;
drop trigger if exists clean_participants on public.plans;
create trigger clean_participants before insert or update of participants, user_id on public.plans
for each row execute function public.clean_participants();

-- 3) Dahil edildiğin planları görebilirsin (gizli olsa bile)
drop policy if exists "plans read" on public.plans;
create policy "plans read" on public.plans for select to authenticated
  using (user_id = (select auth.uid())
         or (select auth.uid()) = any(participants)
         or (not is_private and (select public.is_member()) and public.user_is_member(user_id)));

-- 4) Katılımcı plandan kendini çıkarabilir
create or replace function public.leave_plan(plan uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  update public.plans set participants = array_remove(participants, auth.uid())
  where id = plan and auth.uid() = any(participants);
  return found;
end $$;
revoke all on function public.leave_plan(uuid) from public, anon;
grant execute on function public.leave_plan(uuid) to authenticated;



-- Yapılacaklar listesi: [{ "text": "...", "done": false }, ...]
alter table public.plans add column if not exists todos jsonb not null default '[]';
alter table public.plans drop constraint if exists plans_todos_check;
alter table public.plans add constraint plans_todos_check
  check (jsonb_typeof(todos) = 'array' and jsonb_array_length(todos) <= 50);

-- Plan sahibi, plana dahil edilenler ve lider maddeleri tek tek işaretleyebilir
create or replace function public.set_todo_done(plan uuid, idx int, val boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare res jsonb;
begin
  update public.plans p set todos = jsonb_set(p.todos, array[idx::text, 'done'], to_jsonb(val))
  where p.id = plan and idx >= 0 and idx < jsonb_array_length(p.todos)
    and (p.user_id = auth.uid() or auth.uid() = any(p.participants)
         or (public.is_leader() and not p.is_private and public.user_is_member(p.user_id)))
  returning p.todos into res;
  if res is null then raise exception 'Bu planı işaretleme yetkin yok'; end if;
  return res;
end $$;
revoke all on function public.set_todo_done(uuid, int, boolean) from public, anon;
grant execute on function public.set_todo_done(uuid, int, boolean) to authenticated;

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

-- 1) İlk lider: ekipte hiç lider yoksa ekibe ilk katılan üye lider olur
update public.profiles set is_leader = true
where id = (select id from public.profiles where is_member order by created_at limit 1)
  and not exists (select 1 from public.profiles where is_leader and is_member);

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
