-- Haftalık Plan: Toplantı kategorisi + e-posta bildirimleri
-- Supabase > SQL Editor'a tamamını yapıştırıp "Run" deyin.
-- Mevcut planlar silinmez. Birden fazla çalıştırmak güvenlidir.
-- Önce "guncelleme.sql" çalıştırılmış olmalı (plana kişi ekleme).
--
-- Ne yapar:
--  * Toplantı planlarına "online / yüz yüze", link ve yer alanları ekler.
--  * Biri plana eklendiğinde eklenen kişiye e-posta sırası oluşturur.
--  * Online toplantıdan 15 dk, yüz yüze toplantıdan ve İş / Proje planından 1,5 saat önce
--    plan sahibine ve plana dahil herkese hatırlatma e-postası sırası oluşturur.
--  * Her pazar 10:00'da tüm ekibe "Bu haftaki ekip planını yapmayı unutmayınız" e-postası gider.
--  * Her dakika "bildirim" Edge Function'ını çağırır; e-postaları o gönderir.

-- 0) Gerekli eklentiler (zamanlayıcı ve HTTP çağrısı)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 1) Toplantı alanları
alter table public.plans add column if not exists meeting_type text;
alter table public.plans add column if not exists meeting_link text not null default '';
alter table public.plans add column if not exists meeting_place text not null default '';
alter table public.plans drop constraint if exists plans_meeting_type_check;
alter table public.plans add constraint plans_meeting_type_check
  check (meeting_type is null or meeting_type in ('online', 'yuz_yuze'));
alter table public.plans drop constraint if exists plans_meeting_len_check;
alter table public.plans add constraint plans_meeting_len_check
  check (char_length(meeting_link) <= 500 and char_length(meeting_place) <= 300);

-- 2) E-posta sırası (uygulamadan görünmez; sadece sunucu fonksiyonu okur)
create table if not exists public.email_queue (
  id bigint generated always as identity primary key,
  dedupe_key text unique,
  to_email text not null,
  subject text not null,
  html text not null,
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  attempts int not null default 0,
  sent_at timestamptz,
  error text
);
alter table public.email_queue enable row level security;
revoke all on table public.email_queue from public, anon, authenticated;
create index if not exists email_queue_pending_idx on public.email_queue (created_at) where sent_at is null;

-- yardımcılar
create or replace function private.h(t text) returns text language sql immutable
as $$ select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;') $$;

create or replace function private.plan_mail_html(p public.plans, occ timestamptz, heading text)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  tz constant text := 'Europe/Istanbul';
  owner text := coalesce((select full_name from public.profiles where id = p.user_id), '');
  aylar constant text[] := array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  gunler constant text[] := array['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
  l timestamp := occ at time zone tz;
  le timestamp := (occ + (p.end_at - p.start_at)) at time zone tz;
  ne text;
begin
  ne := '<p style="margin:0 0 6px"><b>Ne zaman:</b> ' || extract(day from l)::int || ' ' || aylar[extract(month from l)::int] || ' '
        || gunler[extract(isodow from l)::int] || ', ' || to_char(l, 'HH24:MI') || '–' || to_char(le, 'HH24:MI') || '</p>';
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:20px;color:#0f172a">'
    || '<p style="margin:0 0 4px;color:#4f46e5;font-weight:700;font-size:13px">HAFTALIK PLAN</p>'
    || '<h2 style="margin:0 0 14px;font-size:20px">' || private.h(heading) || '</h2>'
    || '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px">'
    || '<p style="margin:0 0 8px;font-size:17px;font-weight:700">' || private.h(p.title) || '</p>'
    || ne
    || case when p.category = 'toplanti' and p.meeting_type = 'online' then
         '<p style="margin:0 0 6px"><b>Toplantı:</b> Online'
         || case when p.meeting_link ~* '^https?://' then ' · <a href="' || private.h(p.meeting_link) || '" style="color:#4f46e5;font-weight:700">Toplantıya katıl</a>' else '' end || '</p>'
       when p.category = 'toplanti' and p.meeting_type = 'yuz_yuze' then
         '<p style="margin:0 0 6px"><b>Toplantı:</b> Yüz yüze' || case when p.meeting_place <> '' then ' · ' || private.h(p.meeting_place) else '' end || '</p>'
       else '' end
    || case when owner <> '' then '<p style="margin:0 0 6px"><b>Ekleyen:</b> ' || private.h(owner) || '</p>' else '' end
    || case when jsonb_array_length(coalesce(p.todos, '[]')) > 0 then
         '<p style="margin:10px 0 4px"><b>Yapılacaklar:</b></p><ul style="margin:0;padding-left:20px">'
         || (select string_agg('<li>' || case when (t->>'done')::boolean then '✅ <s>' || private.h(t->>'text') || '</s>' else private.h(t->>'text') end || '</li>', '' order by n)
             from jsonb_array_elements(p.todos) with ordinality as x(t, n))
         || '</ul>'
       else '' end
    || case when p.note <> '' then '<p style="margin:8px 0 0;white-space:pre-wrap;color:#475569">' || private.h(p.note) || '</p>' else '' end
    || '</div>'
    || '<p style="margin:16px 0 0"><a href="https://samiltalha.github.io/haftalik-plan/" style="color:#4f46e5">Uygulamayı aç</a></p>'
    || '</div>';
end $$;

-- 3) Plana eklenen kişilere e-posta
create or replace function public.notify_participants()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  added uuid[];
  r record;
  owner text := coalesce((select full_name from public.profiles where id = new.user_id), 'Bir ekip arkadaşın');
begin
  added := array(select unnest(coalesce(new.participants, '{}'))
                 except select unnest(case when tg_op = 'UPDATE' then coalesce(old.participants, '{}') else '{}'::uuid[] end));
  if coalesce(array_length(added, 1), 0) = 0 then return new; end if;
  if new.repeat = 'none' and new.end_at < now() then return new; end if; -- geçmiş plan
  for r in select u.id, u.email from auth.users u where u.id = any(added) and u.email is not null loop
    insert into public.email_queue (dedupe_key, to_email, subject, html)
    values ('added:' || new.id || ':' || r.id || ':' || extract(epoch from now())::bigint,
            r.email,
            owner || ' seni bir plana ekledi: ' || new.title,
            private.plan_mail_html(new, new.start_at, owner || ' seni bir plana ekledi'))
    on conflict (dedupe_key) do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists notify_participants on public.plans;
create trigger notify_participants after insert or update of participants on public.plans
for each row execute function public.notify_participants();

-- 4) Hatırlatmalar: yaklaşan toplantı ve İş / Proje planları (tekrarlananlar dahil)
create or replace function public.enqueue_reminders()
returns int language plpgsql security definer set search_path = ''
as $$
declare
  tz constant text := 'Europe/Istanbul';
  today date := (now() at time zone tz)::date;
  p public.plans;
  d date;
  sd date;
  occ timestamptz;
  lead interval;
  ok boolean;
  r record;
  n int := 0;
  baslik text;
begin
  for p in
    select * from public.plans
    where category in ('toplanti', 'is')
      and start_at <= now() + interval '2 hours'
      and (start_at >= now() - interval '5 minutes' or repeat <> 'none')
      and (repeat_until is null or repeat_until >= today - 1)
  loop
    lead := case when p.category = 'toplanti' and coalesce(p.meeting_type, 'online') = 'online'
                 then interval '15 minutes' else interval '90 minutes' end;
    sd := (p.start_at at time zone tz)::date;
    foreach d in array array[today, today + 1] loop
      if p.repeat = 'none' then
        occ := p.start_at;
        ok := d = today; -- tek sefer kontrol
      else
        occ := (d + (p.start_at at time zone tz)::time) at time zone tz;
        ok := d >= sd and (p.repeat_until is null or d <= p.repeat_until) and case p.repeat
          when 'daily' then true
          when 'weekdays' then extract(isodow from d) between 1 and 5
          when 'weekly' then extract(isodow from d) = extract(isodow from sd)
          when 'yearly' then extract(month from d) = extract(month from sd) and extract(day from d) = extract(day from sd)
          else false end;
      end if;
      continue when not ok or not (now() >= occ - lead and now() < occ);
      baslik := case when p.category = 'toplanti'
                  then 'Toplantın ' || case when lead = interval '15 minutes' then '15 dakika' else '1,5 saat' end || ' sonra başlıyor'
                  else 'Planın 1,5 saat sonra başlıyor' end;
      for r in select u.id, u.email from auth.users u
               where u.id = any(array[p.user_id] || coalesce(p.participants, '{}')) and u.email is not null loop
        insert into public.email_queue (dedupe_key, to_email, subject, html)
        values ('remind:' || p.id || ':' || extract(epoch from occ)::bigint || ':' || r.id,
                r.email,
                '⏰ ' || p.title || ' · ' || to_char(occ at time zone tz, 'HH24:MI'),
                private.plan_mail_html(p, occ, baslik))
        on conflict (dedupe_key) do nothing;
        if found then n := n + 1; end if;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.enqueue_reminders() from public, anon, authenticated;

-- 5) Sunucu fonksiyonunun e-posta alması (aynı e-posta iki kez gönderilmesin diye kilitli)
create or replace function public.claim_emails(max_count int default 40)
returns setof public.email_queue language sql security definer set search_path = ''
as $$
  update public.email_queue q set locked_at = now(), attempts = q.attempts + 1
  where q.id in (
    select id from public.email_queue
    where sent_at is null and attempts < 5 and (locked_at is null or locked_at < now() - interval '5 minutes')
    order by created_at limit max_count
    for update skip locked)
  returning q.*;
$$;
revoke all on function public.claim_emails(int) from public, anon, authenticated;
grant execute on function public.claim_emails(int) to service_role;
grant select, update on table public.email_queue to service_role;

-- 6) Her dakika: hatırlatmaları sıraya koy, bekleyen e-posta varsa "bildirim" fonksiyonunu çağır
create or replace function public.bildirim_tick()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.enqueue_reminders();
  if exists (select 1 from public.email_queue where sent_at is null and attempts < 5) then
    perform net.http_post(
      url := 'https://xmogshoaqabzxzyzdpvs.supabase.co/functions/v1/bildirim',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  delete from public.email_queue where created_at < now() - interval '30 days';
end $$;
revoke all on function public.bildirim_tick() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('plan-bildirim');
exception when others then null;
end $$;
select cron.schedule('plan-bildirim', '* * * * *', 'select public.bildirim_tick()');

-- 7) Her pazar saat 10:00 (Türkiye saati): tüm ekibe haftalık plan hatırlatması
create or replace function public.haftalik_hatirlatma()
returns int language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  insert into public.email_queue (dedupe_key, to_email, subject, html)
  select 'weekly:' || (now() at time zone 'Europe/Istanbul')::date || ':' || u.id,
         u.email,
         '📅 Bu haftaki ekip planını yapmayı unutmayınız',
         '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:20px;color:#0f172a">'
         || '<p style="margin:0 0 4px;color:#4f46e5;font-weight:700;font-size:13px">HAFTALIK PLAN</p>'
         || '<h2 style="margin:0 0 12px;font-size:20px">Merhaba ' || private.h(split_part(coalesce(p.full_name, ''), ' ', 1)) || ',</h2>'
         || '<p style="margin:0 0 16px;font-size:16px">Bu haftaki ekip planını yapmayı unutmayınız.</p>'
         || '<p style="margin:0"><a href="https://samiltalha.github.io/haftalik-plan/" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:10px">Planımı yap</a></p>'
         || '</div>'
  from public.profiles p join auth.users u on u.id = p.id
  where p.is_member and u.email is not null
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.haftalik_hatirlatma() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('haftalik-hatirlatma');
exception when others then null;
end $$;
-- 07:00 UTC = 10:00 Türkiye saati; e-postayı bir dakika içinde "plan-bildirim" görevi gönderir
select cron.schedule('haftalik-hatirlatma', '0 7 * * 0', 'select public.haftalik_hatirlatma()');

select 'Tamam: toplantı kategorisi ve e-posta bildirimleri kuruldu' as sonuc;
