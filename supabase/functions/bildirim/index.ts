// Haftalık Plan: e-posta gönderici ("bildirim" Edge Function)
// Sıradaki e-postaları Gmail ile gönderir. Her dakika veritabanı tarafından çağrılır.
// Gerekli gizli ayarlar (Edge Functions > Secrets): GMAIL_USER, GMAIL_APP_PASSWORD
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async () => {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  if (!user || !pass) return json({ error: 'GMAIL_USER / GMAIL_APP_PASSWORD gizli ayarları eksik' }, 500);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: rows, error } = await sb.rpc('claim_emails', { max_count: 40 });
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ sent: 0 });

  const mailer = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  let sent = 0;
  const failed: string[] = [];
  for (const r of rows) {
    try {
      await mailer.sendMail({ from: `"Haftalık Plan" <${user}>`, to: r.to_email, subject: r.subject, html: r.html });
      await sb.from('email_queue').update({ sent_at: new Date().toISOString(), error: null }).eq('id', r.id);
      sent++;
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 500);
      failed.push(msg);
      await sb.from('email_queue').update({ error: msg, locked_at: null }).eq('id', r.id);
    }
  }
  return json({ sent, failed: failed.length, errors: failed.slice(0, 3) });
});
