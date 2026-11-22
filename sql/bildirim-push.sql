-- Haftalık Plan: telefona anlık bildirim (web push)
-- Supabase > SQL Editor'a tamamını yapıştırıp "Run" deyin. Tekrar çalıştırmak güvenlidir.
-- Önce hepsi-bir-arada.sql çalıştırılmış olmalı.
-- DİKKAT: Bu dosyada gizli bir anahtar var. Çalıştırdıktan sonra dosyayı kimseyle paylaşmayın.

-- 1) Bildirim anahtarları (gizli anahtar sadece veritabanında, uygulamaya açık değil)
insert into private.private_settings(key, value) values
  ('vapid_public', 'BPMg18d114p9At6AWoaDRi-MRnm-tAcK5D6StPiDLF7EvCoTRM5K1VuO2ltc2FyOeeokTjByfGWbeu-CecrFr_U'),
  ('vapid_private', 'BURAYA-GIZLI-ANAHTAR')
on conflict (key) do nothing;

-- 2) Telefon abonelikleri (her kullanıcı sadece kendi aboneliklerini görür)
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

-- Aynı telefon başka hesapla abone olursa eski kaydı devral
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- 3) Bildirim sırası: e-posta sırasına giren her hatırlatma bildirim olarak da gider (duyurular hariç)
create table if not exists public.push_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  attempts int not null default 0,
  sent_at timestamptz,
  error text
);
alter table public.push_queue enable row level security;
revoke all on table public.push_queue from public, anon, authenticated;
create index if not exists push_queue_pending_idx on public.push_queue (created_at) where sent_at is null;

create or replace function public.email_to_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare uid uuid; govde text;
begin
  if new.dedupe_key like 'duyuru%' then return new; end if;
  select id into uid from auth.users where lower(email) = lower(new.to_email) limit 1;
  if uid is null or not exists (select 1 from public.push_subscriptions where user_id = uid) then return new; end if;
  govde := coalesce(substring(new.html from '<h2[^>]*>(.*?)</h2>'), '');
  govde := replace(replace(replace(replace(replace(govde, '&quot;', '"'), '&gt;', '>'), '&lt;', '<'), '&amp;', '&'), '<br>', ' ');
  if govde = new.subject or govde = '' then govde := 'Haftalık Plan'; end if;
  insert into public.push_queue (user_id, title, body) values (uid, new.subject, govde);
  return new;
end $$;
drop trigger if exists email_to_push on public.email_queue;
create trigger email_to_push after insert on public.email_queue
for each row execute function public.email_to_push();

-- 4) Sunucu fonksiyonu için: bekleyen bildirimleri al + gizli anahtar
create or replace function public.claim_pushes(max_count int default 50)
returns table (id bigint, title text, body text, endpoint text, p256dh text, auth text, sub_id bigint)
language sql security definer set search_path = ''
as $$
  with c as (
    update public.push_queue q set locked_at = now(), attempts = q.attempts + 1
    where q.id in (
      select x.id from public.push_queue x
      where x.sent_at is null and x.attempts < 3 and (x.locked_at is null or x.locked_at < now() - interval '5 minutes')
      order by x.created_at limit max_count for update skip locked)
    returning q.*)
  select c.id, c.title, c.body, s.endpoint, s.p256dh, s.auth, s.id
  from c join public.push_subscriptions s on s.user_id = c.user_id;
$$;
revoke all on function public.claim_pushes(int) from public, anon, authenticated;
grant execute on function public.claim_pushes(int) to service_role;

create or replace function public.get_vapid()
returns jsonb language sql stable security definer set search_path = ''
as $$ select jsonb_object_agg(key, value) from private.private_settings where key in ('vapid_public', 'vapid_private') $$;
revoke all on function public.get_vapid() from public, anon, authenticated;
grant execute on function public.get_vapid() to service_role;
grant select, update on table public.push_queue to service_role;
grant select, delete on table public.push_subscriptions to service_role;

-- 5) Zamanlayıcı: bekleyen e-posta YA DA bildirim varsa gönderici fonksiyonu çağır
create or replace function public.bildirim_tick()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.enqueue_reminders();
  perform public.enqueue_note_reminders();
  if exists (select 1 from public.email_queue where sent_at is null and attempts < 5)
     or exists (select 1 from public.push_queue where sent_at is null and attempts < 3) then
    perform net.http_post(
      url := 'https://xmogshoaqabzxzyzdpvs.supabase.co/functions/v1/bildirim',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  delete from public.email_queue where created_at < now() - interval '30 days';
  delete from public.push_queue where created_at < now() - interval '7 days';
end $$;
revoke all on function public.bildirim_tick() from public, anon, authenticated;

select 'Tamam: telefon bildirimleri kuruldu' as sonuc;
