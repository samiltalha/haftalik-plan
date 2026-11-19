-- Haftalık Plan: planlara ekip arkadaşı ekleme
-- Supabase > SQL Editor'a yapıştırıp "Run" deyin. Mevcut planlar silinmez.
-- Birden fazla çalıştırmak güvenlidir.

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

select 'Tamam: planlara ekip arkadaşı eklenebilir' as sonuc;
