// Haftalık Plan: e-posta ve telefon bildirimi gönderici ("bildirim" Edge Function)
// Sıradaki e-postaları Gmail ile, telefon bildirimlerini web push ile gönderir.
// Her dakika veritabanı tarafından çağrılır.
// Gerekli gizli ayarlar (Edge Functions > Secrets): GMAIL_USER, GMAIL_APP_PASSWORD
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';
import webpush from 'npm:web-push@3.6.7';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Sb = ReturnType<typeof createClient>;

async function sendEmails(sb: Sb) {
  const user = Deno.env.get('GMAIL_USER')?.trim();
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  if (!user || !pass) return { error: 'GMAIL_USER / GMAIL_APP_PASSWORD gizli ayarları eksik' };
  const { data: rows, error } = await sb.rpc('claim_emails', { max_count: 40 });
  if (error) return { error: error.message };
  if (!rows?.length) return { sent: 0 };
  const mailer = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  let sent = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try {
      await mailer.sendMail({ from: `"Haftalık Plan" <${user}>`, to: r.to_email, subject: r.subject, html: r.html });
      await sb.from('email_queue').update({ sent_at: new Date().toISOString(), error: null }).eq('id', r.id);
      sent++;
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 500);
      errors.push(msg);
      await sb.from('email_queue').update({ error: msg, locked_at: null }).eq('id', r.id);
    }
  }
  return { sent, failed: errors.length, errors: errors.slice(0, 3) };
}

async function sendPushes(sb: Sb) {
  const { data: rows, error } = await sb.rpc('claim_pushes', { max_count: 50 });
  if (error) return { error: error.message }; // bildirim SQL'i henüz çalıştırılmadıysa
  if (!rows?.length) return { sent: 0 };
  const { data: keys } = await sb.rpc('get_vapid');
  if (!keys?.vapid_public || !keys?.vapid_private) return { error: 'Bildirim anahtarları yok' };
  webpush.setVapidDetails('https://samiltalha.github.io/haftalik-plan/', keys.vapid_public, keys.vapid_private);

  // bir bildirim birden fazla telefona gidebilir: en az birine ulaşırsa gönderildi say
  const ok = new Set<number>();
  const fail = new Map<number, string>();
  for (const r of rows) {
    const payload = JSON.stringify({ title: r.title, body: r.body, url: 'https://samiltalha.github.io/haftalik-plan/' });
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, { TTL: 3600, urgency: 'high' });
      ok.add(r.id);
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      // telefonun aboneliği bitmiş: sil
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', r.sub_id);
      fail.set(r.id, `${code || ''} ${String((e as Error)?.message || e)}`.slice(0, 300));
    }
  }
  const now = new Date().toISOString();
  const ids = [...new Set(rows.map((r: { id: number }) => r.id))] as number[];
  for (const id of ids) {
    if (ok.has(id)) await sb.from('push_queue').update({ sent_at: now, error: null }).eq('id', id);
    else await sb.from('push_queue').update({ error: fail.get(id) || 'abonelik yok', locked_at: null }).eq('id', id);
  }
  return { sent: ok.size, failed: ids.length - ok.size, errors: [...fail.values()].slice(0, 3) };
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const [email, push] = await Promise.all([
    sendEmails(sb).catch(e => ({ error: String(e) })),
    sendPushes(sb).catch(e => ({ error: String(e) })),
  ]);
  return json({ email, push });
});
