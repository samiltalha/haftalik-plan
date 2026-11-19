// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: calendar-alt;

/*
 * Haftalık Plan — iPhone widget'ı (Scriptable)
 *
 * Kilit ekranında "Günlük Akış": sıradaki plan ve saati, ondan sonraki plan
 * ve sıradaki plana kalan süreyi gösteren bir çubuk. Ana ekran için küçük ve orta
 * boy widget'ları da destekler.
 *
 * Kurulum: widget/KURULUM.md dosyasına bak.
 * İlk çalıştırmada Scriptable içinden ▶︎ ile çalıştır ve uygulamadaki
 * e-posta + şifrenle giriş yap. Bilgiler sadece bu telefonun Anahtar
 * Zinciri'nde (Keychain) saklanır.
 */

// ================== AYARLAR (istersen değiştir) ==================
const AYAR = {
  // Ekibin paylaştığı planlar da gösterilsin mi? (false = sadece benimkiler)
  EKIP_PLANLARI: false,

  // Üst satırdaki geri sayım:
  //   false -> "45 dk sonra" (widget her yenilendiğinde güncellenir)
  //   true  -> iOS'un saniye saniye işleyen canlı sayacı ("44:12")
  CANLI_SAYAC: false,

  // Widget'a dokununca açılacak adres
  UYGULAMA_URL: 'https://samiltalha.github.io/haftalik-plan/',
};
// Widget'ı düzenlerken "Parameter" kısmına "ekip" yazarsan o widget
// ekibin paylaştığı planları da gösterir; "canli" yazarsan canlı sayaç kullanır.

// ================== Bağlantı (değiştirme) ==================
const SUPABASE_URL = 'https://xmogshoaqabzxzyzdpvs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5mdcQYdr_99FTYVSWE3FtA_6W5wekaK'; // herkese açık anahtar
const KC = 'haftalik-plan-widget';

const CAT_COLOR = {
  okul: '#3b82f6', is: '#8b5cf6', calisma: '#06b6d4', spor: '#22c55e',
  kisisel: '#f97316', dogum: '#ec4899', genel: '#94a3b8',
};
const DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

// ================== parametreler ==================
const param = String((typeof args !== 'undefined' && args.widgetParameter) || '').toLowerCase();
if (/\bekip\b/.test(param)) AYAR.EKIP_PLANLARI = true;
if (/\bcanl[iı]\b/.test(param)) AYAR.CANLI_SAYAC = true;

// ================== tarih yardımcıları (web uygulamasıyla aynı) ==================
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pad = n => String(n).padStart(2, '0');
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function parseLocal(dateStr, timeStr) { const [y, m, d] = dateStr.split('-').map(Number); const [h, mi] = timeStr.split(':').map(Number); return new Date(y, m - 1, d, h, mi); }

function occurrences(plan, from, to) {
  const s = new Date(plan.start_at), e = new Date(plan.end_at);
  const dur = e - s;
  const out = [];
  const push = start => {
    const end = new Date(start.getTime() + dur);
    if (start < to && end > from) out.push({ ...plan, occStart: start, occEnd: end });
  };
  if (plan.repeat === 'none') { push(s); return out; }
  const until = plan.repeat_until ? addDays(parseLocal(plan.repeat_until, '00:00'), 1) : null;
  const limit = until && until < to ? until : to;
  const at = day => new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes());
  if (plan.repeat === 'yearly') {
    for (let y = Math.max(s.getFullYear(), from.getFullYear() - 1); y <= to.getFullYear(); y++) {
      const st = new Date(y, s.getMonth(), s.getDate(), s.getHours(), s.getMinutes());
      if (st >= s && st < limit) push(st);
    }
    return out;
  }
  let day = startOfDay(new Date(Math.max(s, addDays(from, -1))));
  for (; day < limit; day = addDays(day, 1)) {
    const st = at(day);
    if (st < s || st >= limit) continue;
    const wd = day.getDay();
    if (plan.repeat === 'weekdays' && (wd === 0 || wd === 6)) continue;
    if (plan.repeat === 'weekly' && wd !== s.getDay()) continue;
    push(st);
  }
  return out;
}
const expand = (plans, from, to) => plans.flatMap(p => occurrences(p, from, to)).sort((a, b) => a.occStart - b.occStart);

// "Bugün" değilse kısa gün etiketi: Yarın / Cum
function dayLabel(d, now) {
  if (sameDay(d, now)) return '';
  if (sameDay(d, addDays(now, 1))) return 'Yarın';
  return DAYS_SHORT[d.getDay()];
}
// "45 dk", "2 sa 10 dk", "3 gün"
function fmtLeft(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r && h < 3 ? `${h} sa ${r} dk` : `${h} sa`;
  return `${Math.round(h / 24)} gün`;
}

// ================== oturum (Keychain) ==================
function kcGet(k) { const key = `${KC}.${k}`; return Keychain.contains(key) ? Keychain.get(key) : null; }
function kcSet(k, v) { Keychain.set(`${KC}.${k}`, v); }
function kcDel(k) { const key = `${KC}.${k}`; if (Keychain.contains(key)) Keychain.remove(key); }

async function authRequest(grant, body) {
  const req = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`);
  req.method = 'POST';
  req.headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  req.body = JSON.stringify(body);
  const json = await req.loadJSON();
  if (!json || !json.access_token) {
    throw new Error((json && (json.error_description || json.msg || json.message)) || 'Giriş başarısız');
  }
  kcSet('session', JSON.stringify({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    user_id: json.user.id,
  }));
  return json;
}

async function getSession() {
  const raw = kcGet('session');
  if (!raw) return null;
  let s = JSON.parse(raw);
  if (Date.now() < s.expires_at - 60 * 1000) return s;
  try {
    await authRequest('refresh_token', { refresh_token: s.refresh_token });
  } catch (e) {
    // yenileme anahtarı geçersizse kayıtlı bilgilerle yeniden giriş yap
    const email = kcGet('email'), password = kcGet('password');
    if (!email || !password) throw e;
    await authRequest('password', { email, password });
  }
  return JSON.parse(kcGet('session'));
}

async function loginFlow() {
  const a = new Alert();
  a.title = 'Haftalık Plan girişi';
  a.message = 'Uygulamada kullandığın e-posta ve şifre. Bilgiler sadece bu telefonda saklanır.';
  a.addTextField('E-posta', kcGet('email') || '');
  a.addSecureTextField('Şifre', '');
  a.addAction('Giriş yap');
  a.addCancelAction('Vazgeç');
  if (await a.presentAlert() === -1) return false;
  const email = a.textFieldValue(0).trim(), password = a.textFieldValue(1);
  try {
    await authRequest('password', { email, password });
    kcSet('email', email);
    kcSet('password', password);
    return true;
  } catch (e) {
    const err = new Alert();
    err.title = 'Giriş olmadı';
    err.message = String(e.message || e);
    err.addAction('Tamam');
    await err.presentAlert();
    return false;
  }
}

function logout() { ['session', 'email', 'password'].forEach(kcDel); }

// ================== veri ==================
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'haftalik-plan-widget-cache.json');

async function fetchPlans(session, from, to) {
  const f = from.toISOString(), t = to.toISOString();
  const time = `or(and(repeat.eq.none,start_at.lt.${t},end_at.gt.${f}),and(repeat.neq.none,start_at.lt.${t}))`;
  const me = session.user_id;
  const get = async params => {
    const req = new Request(`${SUPABASE_URL}/rest/v1/plans?${params.map(encodeURI).join('&')}`);
    req.headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` };
    const data = await req.loadJSON();
    if (!Array.isArray(data)) throw new Error((data && data.message) || 'Planlar alınamadı');
    return data;
  };
  const cols = 'id,user_id,title,category,start_at,end_at,repeat,repeat_until,is_private';
  if (AYAR.EKIP_PLANLARI) return get([`select=${cols}`, `and=(${time})`, 'order=start_at']);
  try {
    // Benim planlarım + beni katılımcı olarak eklediği planlar
    return await get([`select=${cols},participants`, `and=(${time},or(user_id.eq.${me},participants.cs.{${me}}))`, 'order=start_at']);
  } catch (e) {
    // "participants" sütunu henüz yoksa sadece kendi planlarım
    return await get([`select=${cols}`, `and=(${time})`, `user_id=eq.${me}`, 'order=start_at']);
  }
}

// { plans, offline, error }
async function loadData(now) {
  const from = addDays(startOfDay(now), -1), to = addDays(startOfDay(now), 8);
  let session;
  try { session = await getSession(); } catch (e) { session = null; }
  if (!session) {
    if (!kcGet('session') && !kcGet('email')) return { needLogin: true, plans: [] };
  }
  try {
    if (!session) throw new Error('oturum yenilenemedi');
    const plans = await fetchPlans(session, from, to);
    fm.writeString(cachePath, JSON.stringify({ at: now.toISOString(), plans }));
    return { plans, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      const c = JSON.parse(fm.readString(cachePath));
      return { plans: c.plans || [], offline: true, error: String(e.message || e) };
    }
    return { plans: [], offline: true, error: String(e.message || e) };
  }
}

function summarize(plans, now) {
  const today = startOfDay(now), tomorrow = addDays(today, 1);
  const occ = expand(plans, addDays(today, -1), addDays(today, 8));
  const upcoming = occ.filter(o => o.occEnd > now); // devam eden plan da dahil
  const todays = occ.filter(o => o.occStart < tomorrow && o.occEnd > today);
  const doneToday = todays.filter(o => o.occEnd <= now).length;
  const next = upcoming[0] || null;
  const after = upcoming[1] || null;
  // Çubuğun başlangıcı: bugün en son biten planın bitişi, yoksa günün başı
  let prevEnd = today;
  for (const o of occ) if (o.occEnd <= now && o.occEnd > prevEnd) prevEnd = o.occEnd;
  let mode = 'empty';
  if (next && next.occStart <= now) mode = 'now';
  else if (next && next.occStart < tomorrow) mode = 'next';
  else if (next) mode = 'done';
  return { upcoming, next, after, todays, doneToday, prevEnd, mode };
}

// ================== çizim yardımcıları ==================
function progressBar(fraction, width, height, fg, bg) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const r = height / 2;
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, height), r, r);
  dc.addPath(track);
  dc.setFillColor(bg);
  dc.fillPath();
  const f = Math.max(0, Math.min(1, fraction || 0));
  if (f > 0) {
    const w = Math.max(height, width * f);
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, w, height), r, r);
    dc.addPath(fill);
    dc.setFillColor(fg);
    dc.fillPath();
  }
  return dc.getImage();
}

function ringImage(fraction, size, line, fg, bg) {
  const dc = new DrawContext();
  dc.size = new Size(size, size);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const c = size / 2, rad = c - line / 2;
  const arc = (from, to, color) => {
    const steps = Math.max(2, Math.ceil((to - from) * 60));
    for (let i = 0; i < steps; i++) {
      const a = (from + (to - from) * (i / steps)) * 2 * Math.PI - Math.PI / 2;
      const x = c + rad * Math.cos(a), y = c + rad * Math.sin(a);
      dc.setFillColor(color);
      dc.fillEllipse(new Rect(x - line / 2, y - line / 2, line, line));
    }
  };
  arc(0, 1, bg);
  if (fraction > 0) arc(0, Math.min(1, fraction), fg);
  return dc.getImage();
}

// Saat yazısı; bugün değilse önüne "Yarın" / "Cum" eklenir
function whenText(o, now) {
  const dl = dayLabel(o.occStart, now);
  return `${dl ? dl + ' ' : ''}${hm(o.occStart)}`;
}

function minutesLeft(ms) { return fmtLeft(Math.ceil(ms / 60000) * 60000); }

// ================== widget'lar ==================
// Harfler arasına ince boşluk koyarak "GÜNLÜK AKIŞ" gibi aralıklı büyük harf
const track = str => str.toLocaleUpperCase('tr-TR').split('').join(' ');

// Günün zaman çizelgesi: ince çizgi, her plan için bir nokta, şimdiye kadar dolu,
// sıradaki planın noktası daha büyük
function timelineImage(s, now, width, height) {
  const today = startOfDay(now);
  const H = 3600000;
  const starts = s.todays.map(o => Math.max(o.occStart, today));
  const ends = s.todays.map(o => Math.min(o.occEnd, addDays(today, 1)));
  let from = Math.min(today.getTime() + 7 * H, now.getTime(), ...starts);
  let to = Math.max(today.getTime() + 22 * H, now.getTime(), ...ends);
  from = Math.max(today.getTime(), Math.floor(from / H) * H);
  to = Math.min(addDays(today, 1).getTime(), Math.ceil(to / H) * H);

  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const R = height / 2;            // büyük nokta yarıçapı
  const r = height * 0.26;         // küçük nokta
  const lh = Math.max(2, height * 0.22); // çizgi kalınlığı
  const x0 = R, x1 = width - R, cy = height / 2;
  const xAt = t => x0 + (x1 - x0) * Math.max(0, Math.min(1, (t - from) / (to - from)));
  const bar = (a, b, color) => {
    if (b <= a) return;
    const p = new Path();
    p.addRoundedRect(new Rect(a, cy - lh / 2, b - a, lh), lh / 2, lh / 2);
    dc.addPath(p);
    dc.setFillColor(color);
    dc.fillPath();
  };
  const dim = new Color('#ffffff', 0.3);
  const full = Color.white();
  const nowX = s.mode === 'done' ? x1 : xAt(now.getTime());
  bar(x0 - r, x1 + r, dim);
  bar(x0 - r, nowX, full);
  const nextStart = s.next && s.mode !== 'done' ? s.next.occStart.getTime() : null;
  for (const t of starts) {
    const x = xAt(t);
    const isNext = nextStart !== null && t === Math.max(nextStart, today.getTime());
    const rad = isNext ? R : r;
    if (isNext) { // sıradaki plan: hafif hale + büyük nokta
      dc.setFillColor(new Color('#ffffff', 0.35));
      dc.fillEllipse(new Rect(x - rad, cy - rad, rad * 2, rad * 2));
      const cr = rad * 0.62;
      dc.setFillColor(full);
      dc.fillEllipse(new Rect(x - cr, cy - cr, cr * 2, cr * 2));
      continue;
    }
    dc.setFillColor(x <= nowX ? full : new Color('#ffffff', 0.55));
    dc.fillEllipse(new Rect(x - rad, cy - rad, rad * 2, rad * 2));
  }
  return dc.getImage();
}

function lockRect(data, now) {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  const s = summarize(data.plans, now);
  const white = Color.white();
  const capFont = Font.semiboldSystemFont(11);

  // 1. satır: GÜNLÜK AKIŞ · 45 dk ........ 4/6
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  const cap = (txt, op = 0.7) => { const t = head.addText(txt); t.font = capFont; t.textOpacity = op; t.lineLimit = 1; t.minimumScaleFactor = 0.75; return t; };
  if (data.offline) {
    const ic = head.addImage(SFSymbol.named('icloud.slash').image);
    ic.imageSize = new Size(10, 10);
    ic.tintColor = white;
    head.addSpacer(3);
  }
  if (data.needLogin) cap(track('Günlük Akış'));
  else if (s.mode === 'now') {
    cap(`${track('Şu an')}\u00A0·\u00A0`);
    if (AYAR.CANLI_SAYAC) { const d = head.addDate(s.next.occEnd); d.applyTimerStyle(); d.font = capFont; d.textOpacity = 0.7; cap(' kaldı'); }
    else cap(`${minutesLeft(s.next.occEnd - now)} kaldı`);
  } else if (s.mode === 'next') {
    cap(`${track('Günlük Akış')}\u00A0·\u00A0`);
    if (AYAR.CANLI_SAYAC) { const d = head.addDate(s.next.occStart); d.applyTimerStyle(); d.font = capFont; d.textOpacity = 0.7; }
    else cap(minutesLeft(s.next.occStart - now));
  } else if (s.mode === 'done') cap(`${track('Bugün tamam')} ✓`);
  else cap(track('Günlük Akış'));
  head.addSpacer();
  const right = s.mode === 'done' ? dayLabel(s.next.occStart, now)
    : s.todays.length ? `${s.doneToday}/${s.todays.length}` : '';
  if (!data.needLogin && right) {
    const pr = head.addText(right);
    pr.font = Font.semiboldMonospacedSystemFont(11);
    pr.textOpacity = 0.7;
  }

  if (data.needLogin) {
    w.addSpacer(2);
    const t = w.addText('Giriş için Scriptable’da çalıştır');
    t.font = Font.boldSystemFont(14);
    t.lineLimit = 2;
    t.minimumScaleFactor = 0.7;
    return w;
  }

  // 2. satır: başlık (yer bitince …) ........ saat
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const title = row.addText(s.next ? s.next.title : 'Yaklaşan plan yok');
  title.font = Font.boldSystemFont(15);
  title.lineLimit = 1;
  row.addSpacer();
  if (s.next) {
    row.addSpacer(6);
    // gün bilgisi (Yarın / Cum) üst satırın sağında, burada sadece saat
    const tm = row.addText(hm(s.next.occStart));
    tm.font = Font.semiboldSystemFont(15);
    tm.lineLimit = 1;
  }

  // 3. satır: → sonraki plan · 16:00
  if (s.after) {
    const r3 = w.addStack();
    r3.layoutHorizontally();
    r3.centerAlignContent();
    const a = r3.addText(`→ ${s.after.title}`);
    a.font = Font.mediumSystemFont(12);
    a.textOpacity = 0.7;
    a.lineLimit = 1;
    const b = r3.addText(`\u00A0·\u00A0${whenText(s.after, now)}`);
    b.font = Font.mediumSystemFont(12);
    b.textOpacity = 0.7;
    b.lineLimit = 1;
    r3.addSpacer();
  }

  // Günün zaman çizelgesi (genişlik verilmez, widget'a oranlı yayılır)
  w.addSpacer(5);
  w.addImage(timelineImage(s, now, 320, 16));
  return w;
}

function lockInline(data, now) {
  const w = new ListWidget();
  const s = summarize(data.plans, now);
  let t;
  if (data.needLogin) t = 'Günlük Akış: giriş yap';
  else if (s.mode === 'now') t = `Şu an: ${s.next.title} · ${minutesLeft(s.next.occEnd - now)} kaldı`;
  else if (s.mode === 'next') t = `${hm(s.next.occStart)} · ${s.next.title}`;
  else if (s.mode === 'done') t = `Bugün tamam ✓ · ${whenText(s.next, now)} ${s.next.title}`;
  else t = 'Yaklaşan plan yok';
  w.addText(t);
  return w;
}

function lockCircular(data, now) {
  const w = new ListWidget();
  w.addAccessoryWidgetBackground = true;
  const s = summarize(data.plans, now);
  const frac = s.todays.length ? s.doneToday / s.todays.length : 0;
  const z = w.addStack();
  z.size = new Size(60, 60);
  z.backgroundImage = ringImage(frac, 60, 5, Color.white(), new Color('#ffffff', 0.25));
  z.layoutVertically();
  z.centerAlignContent();
  z.addSpacer();
  const r1 = z.addStack(); r1.addSpacer();
  const a = r1.addText(`${s.doneToday}/${s.todays.length}`);
  a.font = Font.boldRoundedSystemFont(16);
  r1.addSpacer();
  const r2 = z.addStack(); r2.addSpacer();
  const b = r2.addText('bugün');
  b.font = Font.mediumSystemFont(9);
  b.textOpacity = 0.8;
  r2.addSpacer();
  z.addSpacer();
  return w;
}

function homeWidget(data, now, size) {
  const w = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color('#1e1b4b'), new Color('#0f172a')];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.setPadding(14, 14, 12, 14);
  const s = summarize(data.plans, now);
  const muted = new Color('#cbd5e1');

  const head = w.addStack();
  head.centerAlignContent();
  const ic = head.addImage(SFSymbol.named(data.offline ? 'icloud.slash' : 'timer').image);
  ic.imageSize = new Size(13, 13);
  ic.tintColor = new Color('#a5b4fc');
  head.addSpacer(5);
  const ht = head.addText('Günlük Akış');
  ht.font = Font.semiboldSystemFont(12);
  ht.textColor = new Color('#a5b4fc');
  ht.lineLimit = 1;
  ht.minimumScaleFactor = 0.8;
  head.addSpacer();
  if (size !== 'small' && s.todays.length) {
    const pr = head.addText(`Bugün ${s.doneToday}/${s.todays.length}`);
    pr.font = Font.mediumSystemFont(12);
    pr.textColor = muted;
  }
  w.addSpacer(8);

  if (data.needLogin) {
    const t = w.addText('Giriş yapmak için bu betiği Scriptable içinde bir kez çalıştır.');
    t.font = Font.mediumSystemFont(13);
    t.textColor = Color.white();
    w.addSpacer();
    return w;
  }
  if (!s.next) {
    const t = w.addText('Yaklaşan plan yok 🎉');
    t.font = Font.boldSystemFont(16);
    t.textColor = Color.white();
    w.addSpacer();
    return w;
  }

  // Sıradaki plan (büyük)
  const n = s.next;
  const tStack = w.addStack();
  tStack.centerAlignContent();
  const dot = tStack.addStack();
  dot.size = new Size(4, 34);
  dot.cornerRadius = 2;
  dot.backgroundColor = new Color(CAT_COLOR[n.category] || CAT_COLOR.genel);
  tStack.addSpacer(8);
  const col = tStack.addStack();
  col.layoutVertically();
  const tt = col.addText(n.title);
  tt.font = Font.boldSystemFont(size === 'small' ? 15 : 17);
  tt.textColor = Color.white();
  tt.lineLimit = 2;
  tt.minimumScaleFactor = 0.75;
  const sub = col.addStack();
  sub.centerAlignContent();
  const dl = dayLabel(n.occStart, now);
  const st = sub.addText(n.occStart <= now
    ? `Şimdi · ${hm(n.occEnd)}'e kadar`
    : `${dl ? dl + ' ' : ''}${hm(n.occStart)}–${hm(n.occEnd)}`);
  st.font = Font.mediumSystemFont(12);
  st.textColor = muted;
  st.lineLimit = 1;
  st.minimumScaleFactor = 0.8;

  w.addSpacer(6);
  const cd = w.addStack();
  cd.centerAlignContent();
  const cdi = cd.addImage(SFSymbol.named(n.occStart <= now ? 'hourglass' : 'clock').image);
  cdi.imageSize = new Size(11, 11);
  cdi.tintColor = new Color('#fbbf24');
  cd.addSpacer(4);
  const cdt = cd.addDate(n.occStart <= now ? n.occEnd : n.occStart);
  cdt.applyRelativeStyle();
  cdt.font = Font.semiboldSystemFont(12);
  cdt.textColor = new Color('#fbbf24');
  cdt.lineLimit = 1;

  // Sonraki planlar
  const rest = s.upcoming.slice(1, size === 'small' ? 2 : size === 'large' ? 8 : 4);
  if (rest.length) {
    w.addSpacer(8);
    for (const o of rest) {
      const r = w.addStack();
      r.centerAlignContent();
      const d = r.addStack();
      d.size = new Size(6, 6);
      d.cornerRadius = 3;
      d.backgroundColor = new Color(CAT_COLOR[o.category] || CAT_COLOR.genel);
      r.addSpacer(6);
      const lb = dayLabel(o.occStart, now);
      const tm = r.addText(`${lb ? lb + ' ' : ''}${hm(o.occStart)}`);
      tm.font = Font.semiboldMonospacedSystemFont(11);
      tm.textColor = muted;
      r.addSpacer(6);
      const ti = r.addText(o.title);
      ti.font = Font.mediumSystemFont(12);
      ti.textColor = Color.white();
      ti.lineLimit = 1;
      r.addSpacer();
      w.addSpacer(3);
    }
  }
  w.addSpacer();
  if (size !== 'small') {
    const frac = s.todays.length ? s.doneToday / s.todays.length : 0;
    w.addImage(progressBar(frac, 600, 10, new Color('#818cf8'), new Color('#ffffff', 0.15)));
  }
  return w;
}

// Yenilenme: bir sonraki plan başlangıcı/bitişi ya da en geç 5 dk sonra
// (iOS bunu bir istek olarak alır; gerçek yenilenme sıklığını iOS belirler)
function nextRefresh(data, now) {
  const s = summarize(data.plans, now);
  let t = now.getTime() + 5 * 60000;
  if (s.next) t = Math.min(t, (s.next.occStart > now ? s.next.occStart : s.next.occEnd).getTime());
  return new Date(Math.max(now.getTime() + 60000, t));
}

function build(family, data, now) {
  let w;
  if (family === 'accessoryRectangular') w = lockRect(data, now);
  else if (family === 'accessoryInline') w = lockInline(data, now);
  else if (family === 'accessoryCircular') w = lockCircular(data, now);
  else w = homeWidget(data, now, family || 'medium');
  w.url = AYAR.UYGULAMA_URL;
  w.refreshAfterDate = nextRefresh(data, now);
  return w;
}

// ================== çalıştır ==================
async function main() {
  const now = new Date();
  if (config.runsInWidget || config.runsInAccessoryWidget) {
    const data = await loadData(now);
    Script.setWidget(build(config.widgetFamily, data, now));
    return;
  }

  // Uygulama içinden çalıştırıldı: menü
  if (!kcGet('session')) {
    if (!(await loginFlow())) return;
  }
  const a = new Alert();
  a.title = 'Haftalık Plan widget';
  a.message = `Giriş yapıldı: ${kcGet('email') || '?'}`;
  const actions = [
    ['Önizle: kilit ekranı', 'accessoryRectangular'],
    ['Önizle: kilit ekranı (tek satır)', 'accessoryInline'],
    ['Önizle: kilit ekranı (yuvarlak)', 'accessoryCircular'],
    ['Önizle: ana ekran küçük', 'small'],
    ['Önizle: ana ekran orta', 'medium'],
    ['Önizle: ana ekran büyük', 'large'],
    ['Hesabı değiştir', 'login'],
    ['Çıkış yap', 'logout'],
  ];
  actions.forEach(([t]) => a.addAction(t));
  a.addCancelAction('Kapat');
  const i = await a.presentSheet();
  if (i === -1) return;
  const act = actions[i][1];
  if (act === 'login') { await loginFlow(); return; }
  if (act === 'logout') { logout(); return; }
  const data = await loadData(now);
  const w = build(act, data, now);
  if (act === 'accessoryRectangular') await w.presentAccessoryRectangular();
  else if (act === 'accessoryInline') await w.presentAccessoryInline();
  else if (act === 'accessoryCircular') await w.presentAccessoryCircular();
  else if (act === 'small') await w.presentSmall();
  else if (act === 'large') await w.presentLarge();
  else await w.presentMedium();
}

await main();
Script.complete();
