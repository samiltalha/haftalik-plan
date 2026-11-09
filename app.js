import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ================= constants ================= */
const CATEGORIES = [
  { id: 'okul', name: 'Okul / Ders', color: '#2563eb' },
  { id: 'is', name: 'İş / Proje', color: '#7c3aed' },
  { id: 'calisma', name: 'Çalışma', color: '#0891b2' },
  { id: 'spor', name: 'Spor', color: '#16a34a' },
  { id: 'kisisel', name: 'Kişisel', color: '#ea580c' },
  { id: 'dogum', name: 'Doğum günü / Özel gün', color: '#db2777' },
  { id: 'genel', name: 'Diğer', color: '#64748b' },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const COLORS = ['#4f46e5', '#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#475569'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const REPEAT_LABEL = { daily: 'Her gün', weekdays: 'Hafta içi', weekly: 'Her hafta', yearly: 'Her yıl' };

const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

/* ================= state ================= */
const state = {
  session: null,
  profile: null,
  profiles: [],
  view: localGet('view') || 'today',
  weekOffset: 0,
  teamDay: null, // Date
  teamFilter: 'all',
  cache: { mine: [], team: [] },
  channel: null,
};

function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

/* ================= date helpers ================= */
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pad = n => String(n).padStart(2, '0');
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${DAYS[d.getDay()]}`;
function weekStart(d) { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); } // Monday
function parseLocal(dateStr, timeStr) { const [y, m, d] = dateStr.split('-').map(Number); const [h, mi] = timeStr.split(':').map(Number); return new Date(y, m - 1, d, h, mi); }

/* ===== expand recurring plans into concrete occurrences within [from, to) ===== */
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
function expand(plans, from, to) {
  return plans.flatMap(p => occurrences(p, from, to)).sort((a, b) => a.occStart - b.occStart);
}

/* ================= data ================= */
async function fetchPlans(from, to) {
  const f = from.toISOString(), t = to.toISOString();
  const { data, error } = await sb.from('plans').select('*')
    .or(`and(repeat.eq.none,start_at.lt.${t},end_at.gt.${f}),and(repeat.neq.none,start_at.lt.${t})`)
    .order('start_at');
  if (error) { toast('Planlar yüklenemedi: ' + error.message); return []; }
  return data;
}
async function loadProfile() {
  const uid = state.session.user.id;
  const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  state.profile = data || { id: uid, full_name: state.session.user.email, color: COLORS[0], is_member: false };
  const { data: all } = await sb.from('profiles').select('*').order('full_name');
  state.profiles = all || [state.profile];
}
const profileOf = id => state.profiles.find(p => p.id === id) || { full_name: '?', color: '#64748b' };
const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr');

/* ================= rendering ================= */
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function planItem(o, { showOwner = false, now = new Date() } = {}) {
  const cat = CAT[o.category] || CAT.genel;
  const owner = profileOf(o.user_id);
  const isNow = o.occStart <= now && o.occEnd > now;
  const isPast = o.occEnd <= now;
  const multiDay = !sameDay(o.occStart, new Date(o.occEnd - 1));
  const time = multiDay ? `${hm(o.occStart)} → ${o.occEnd.getDate()} ${MONTHS[o.occEnd.getMonth()].slice(0, 3)}` : `${hm(o.occStart)}–${hm(o.occEnd)}`;
  return `<button class="plan ${isNow ? 'now' : ''} ${isPast ? 'past' : ''}" data-plan="${o.id}" data-occ="${o.occStart.getTime()}">
    <span class="bar" style="background:${cat.color}"></span>
    <span class="time">${time}</span>
    <span class="body">
      <span class="title">${esc(o.title)}</span>
      <span class="meta">
        ${isNow ? '<span class="nowpill">ŞU AN</span>' : ''}
        ${showOwner ? `<span class="tag" style="border-color:${owner.color};color:${owner.color}">${esc(owner.full_name)}</span>` : ''}
        <span class="tag">${esc(cat.name)}</span>
        ${o.repeat !== 'none' ? `<span class="tag">↻ ${REPEAT_LABEL[o.repeat]}</span>` : ''}
        ${o.is_private ? '<span class="tag lock">Özel</span>' : ''}
      </span>
    </span>
  </button>`;
}

function shell(inner, title, sub) {
  const p = state.profile;
  return `<div class="shell">
    <header class="top">
      <h1>${esc(title)}<span class="sub">${esc(sub || '')}</span></h1>
      <button class="avatar" id="profileBtn" title="Profil" style="background:${p.color}">${esc(initials(p.full_name))}</button>
    </header>
    <nav class="tabs">
      ${[['today', 'Bugün'], ['week', 'Haftam'], ['team', 'Ekip']].map(([v, l]) =>
        `<button data-view="${v}" class="${state.view === v ? 'active' : ''}">${ICONS[v]}<span>${l}</span></button>`).join('')}
    </nav>
    <main>${inner}</main>
    <button class="fab" id="fab" aria-label="Plan ekle">+</button>
  </div>`;
}

async function render() {
  if (!state.session) return renderAuth();
  if (state.view === 'week') return renderWeek();
  if (state.view === 'team') return renderTeam();
  return renderToday();
}

async function renderToday() {
  const now = new Date();
  const today = startOfDay(now);
  const horizon = addDays(today, 60);
  const plans = await fetchPlans(today, horizon);
  const mine = plans.filter(p => p.user_id === state.profile.id);
  state.cache.mine = mine;
  state.cache.team = plans;
  const todayOcc = expand(mine, today, addDays(today, 1));
  const tomorrowOcc = expand(mine, addDays(today, 1), addDays(today, 2));
  const weekEnd = addDays(weekStart(now), 7);
  const restOfWeek = expand(mine, addDays(today, 2), weekEnd);
  const special = expand(plans.filter(p => p.category === 'dogum'), addDays(today, 1), horizon).slice(0, 8);
  const current = todayOcc.find(o => o.occStart <= now && o.occEnd > now);
  const next = todayOcc.find(o => o.occStart > now);

  let html = '';
  if (now.getDay() === 0) {
    html += `<div class="card banner"><p><b>Bugün pazar.</b> Gelecek haftanın planını yaptın mı? Ekip de görecek.</p>
      <button class="btn primary" id="planNextWeek">Gelecek haftayı planla</button></div>`;
  }
  if (!state.profile.is_member) html += joinCard();

  const summary = current
    ? `Şu an: <b>${esc(current.title)}</b> (${hm(current.occEnd)}'a kadar)`
    : next ? `Sıradaki: <b>${esc(next.title)}</b>, ${hm(next.occStart)}` : (todayOcc.length ? 'Bugünkü planların bitti 🎉' : '');

  html += `<div class="grid2"><div>
    <div class="card"><h3>Bugün <span class="count">${todayOcc.length} plan</span></h3>
      ${summary ? `<p style="margin:0 0 10px">${summary}</p>` : ''}
      ${todayOcc.length ? todayOcc.map(o => planItem(o, { now })).join('') : `<div class="empty">Bugün için plan yok. Sağ alttaki + ile ekleyebilirsin.</div>`}
    </div>
    <div class="card"><h3>Yarın <span class="count">${fmtDay(addDays(today, 1))}</span></h3>
      ${tomorrowOcc.length ? tomorrowOcc.map(o => planItem(o, { now })).join('') : '<div class="empty">Yarın için plan yok.</div>'}
    </div></div><div>
    <div class="card"><h3>Bu haftanın kalanı</h3>
      ${restOfWeek.length ? groupByDay(restOfWeek).map(([d, list]) => `<div style="margin-bottom:8px"><div class="hint" style="margin:4px 0">${fmtDay(d)}</div>${list.map(o => planItem(o, { now })).join('')}</div>`).join('') : '<div class="empty">Haftanın geri kalanı boş.</div>'}
    </div>
    <div class="card"><h3>🎂 Yaklaşan özel günler</h3>
      ${special.length ? special.map(o => `<div class="plan" style="cursor:default"><span class="bar" style="background:${CAT.dogum.color}"></span><span class="time">${o.occStart.getDate()} ${MONTHS[o.occStart.getMonth()]}</span><span class="body"><span class="title">${esc(o.title)}</span><span class="meta"><span class="tag">${esc(profileOf(o.user_id).full_name)}</span><span class="tag">${daysUntil(o.occStart)}</span></span></span></div>`).join('') : '<div class="empty">Önümüzdeki 60 günde özel gün yok. Doğum günlerini "Doğum günü / Özel gün" kategorisiyle ekle.</div>'}
    </div>
  </div></div>`;

  $app.innerHTML = shell(html, 'Bugün ne yapacağım?', fmtDay(now));
  bindCommon();
  document.getElementById('planNextWeek')?.addEventListener('click', () => { state.weekOffset = 1; setView('week'); });
}

function daysUntil(d) {
  const n = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  return n === 1 ? 'yarın' : `${n} gün sonra`;
}
function groupByDay(list) {
  const m = new Map();
  for (const o of list) { const k = ymd(o.occStart); if (!m.has(k)) m.set(k, [startOfDay(o.occStart), []]); m.get(k)[1].push(o); }
  return [...m.values()];
}

async function renderWeek() {
  const now = new Date();
  const ws = addDays(weekStart(now), state.weekOffset * 7);
  const we = addDays(ws, 7);
  const plans = (await fetchPlans(ws, we)).filter(p => p.user_id === state.profile.id);
  state.cache.mine = plans;
  const occ = expand(plans, ws, we);
  let html = weekNav(ws, 'w');
  html += '<div class="week compact">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const list = occ.filter(o => sameDay(o.occStart, d));
    html += `<div class="day ${sameDay(d, now) ? 'today' : ''}">
      <div class="dh"><b>${DAYS[d.getDay()]}</b><span>${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}</span></div>
      ${list.map(o => planItem(o, { now })).join('')}
      <button class="add" data-add="${ymd(d)}">+ Ekle</button>
    </div>`;
  }
  html += '</div>';
  $app.innerHTML = shell(html, 'Haftam', 'Sadece senin planların');
  bindCommon();
  bindWeekNav('w');
  $app.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => openPlanDialog(null, b.dataset.add)));
}

function weekNav(ws, key) {
  const we = addDays(ws, 6);
  const label = ws.getMonth() === we.getMonth()
    ? `${ws.getDate()}–${we.getDate()} ${MONTHS[ws.getMonth()]} ${we.getFullYear()}`
    : `${ws.getDate()} ${MONTHS[ws.getMonth()]} – ${we.getDate()} ${MONTHS[we.getMonth()]}`;
  const rel = state.weekOffset === 0 ? 'Bu hafta' : state.weekOffset === 1 ? 'Gelecek hafta' : state.weekOffset === -1 ? 'Geçen hafta' : '';
  return `<div class="weeknav">
    <button data-${key}="-1" aria-label="Önceki hafta">‹</button>
    <span class="label">${label}${rel ? ` <span class="hint">· ${rel}</span>` : ''}</span>
    ${state.weekOffset !== 0 ? `<button data-${key}="0">Bu hafta</button>` : ''}
    <button data-${key}="1" aria-label="Sonraki hafta">›</button>
  </div>`;
}
function bindWeekNav(key) {
  $app.querySelectorAll(`[data-${key}]`).forEach(b => b.addEventListener('click', () => {
    const v = Number(b.dataset[key]);
    state.weekOffset = v === 0 ? 0 : state.weekOffset + v;
    if (key === 't') state.teamDay = null;
    render();
  }));
}

async function renderTeam() {
  const now = new Date();
  if (!state.profile.is_member) {
    $app.innerHTML = shell(joinCard(), 'Ekip planları', 'Ekibe katıl');
    bindCommon();
    return;
  }
  const ws = addDays(weekStart(now), state.weekOffset * 7);
  const we = addDays(ws, 7);
  if (!state.teamDay || state.teamDay < ws || state.teamDay >= we) {
    state.teamDay = state.weekOffset === 0 ? startOfDay(now) : ws;
  }
  const day = state.teamDay;
  const plans = await fetchPlans(ws, we);
  state.cache.team = plans;
  const occ = expand(plans, ws, we);
  const members = state.profiles.filter(p => p.is_member);

  let html = weekNav(ws, 't');
  html += '<div class="chips" id="dayChips">' + Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const n = occ.filter(o => sameDay(o.occStart, d)).length;
    return `<button class="chip ${sameDay(d, day) ? 'active' : ''}" data-day="${i}">${DAYS_SHORT[d.getDay()]} ${d.getDate()}<small>${n} plan</small></button>`;
  }).join('') + '</div>';
  html += '<div class="chips">' + [['all', 'Herkes'], ...members.map(m => [m.id, m.full_name])].map(([id, name]) =>
    `<button class="chip ${state.teamFilter === id ? 'active' : ''}" data-who="${id}">${esc(name)}</button>`).join('') + '</div>';

  const shown = state.teamFilter === 'all' ? members : members.filter(m => m.id === state.teamFilter);
  html += '<div class="members">';
  for (const m of shown) {
    const list = occ.filter(o => o.user_id === m.id && sameDay(o.occStart, day));
    const doingNow = occ.find(o => o.user_id === m.id && o.occStart <= now && o.occEnd > now);
    html += `<div class="card member"><h3>
      <span class="avatar sm" style="background:${m.color}">${esc(initials(m.full_name))}</span>
      ${esc(m.full_name)}${m.id === state.profile.id ? ' <span class="count">(sen)</span>' : ''}
      ${doingNow ? `<span class="now-doing"><b>●</b> ${esc(doingNow.title)}</span>` : ''}
    </h3>
    ${list.length ? list.map(o => planItem(o, { now })).join('') : '<div class="empty">Bu gün için plan yok.</div>'}
    </div>`;
  }
  html += '</div>';
  $app.innerHTML = shell(html, 'Ekip planları', fmtDay(day));
  bindCommon();
  bindWeekNav('t');
  $app.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { state.teamDay = addDays(ws, Number(b.dataset.day)); render(); }));
  $app.querySelectorAll('[data-who]').forEach(b => b.addEventListener('click', () => { state.teamFilter = b.dataset.who; render(); }));
}

function joinCard() {
  return `<div class="card banner"><p><b>Ekibe katıl.</b> Ekip planlarını görmek ve planlarını ekiple paylaşmak için ekip kodunu gir.</p>
    <form id="joinForm" style="display:flex;gap:8px;flex:1;min-width:220px">
      <input name="code" placeholder="Ekip kodu" required style="margin:0;text-transform:uppercase" autocomplete="off">
      <button class="btn primary">Katıl</button>
    </form></div>`;
}

function bindCommon() {
  $app.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.weekOffset = 0; setView(b.dataset.view); }));
  document.getElementById('fab')?.addEventListener('click', () => {
    const d = state.view === 'team' && state.teamDay ? state.teamDay : state.view === 'week' && state.weekOffset ? addDays(weekStart(new Date()), state.weekOffset * 7) : new Date();
    openPlanDialog(null, ymd(d));
  });
  document.getElementById('profileBtn')?.addEventListener('click', openProfileDialog);
  $app.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => {
    const all = [...state.cache.mine, ...state.cache.team];
    const p = all.find(x => x.id === b.dataset.plan);
    if (!p) return;
    const occStart = new Date(Number(b.dataset.occ));
    if (p.user_id === state.profile.id) openPlanDialog(p, null, occStart); else openView(p, occStart);
  }));
  const jf = document.getElementById('joinForm');
  jf?.addEventListener('submit', async e => {
    e.preventDefault();
    const code = new FormData(jf).get('code');
    const { data, error } = await sb.rpc('join_team', { code });
    if (error || !data) { toast('Kod hatalı.'); return; }
    toast('Ekibe katıldın!');
    await loadProfile();
    render();
  });
}

function setView(v) { state.view = v; localSet('view', v); render(); }

/* ================= plan dialog ================= */
const planDialog = document.getElementById('planDialog');
const planForm = document.getElementById('planForm');
let editing = null;
document.getElementById('categorySelect').innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

function syncRepeatUI() {
  const r = planForm.repeat.value;
  document.getElementById('untilWrap').style.visibility = r === 'none' || r === 'yearly' ? 'hidden' : 'visible';
}
planForm.repeat.addEventListener('change', syncRepeatUI);
planForm.category.addEventListener('change', () => {
  if (planForm.category.value === 'dogum' && planForm.repeat.value === 'none' && !editing) planForm.repeat.value = 'yearly';
  syncRepeatUI();
});
planForm.start.addEventListener('change', () => {
  if (!planForm.start.value) return;
  const [h, m] = planForm.start.value.split(':').map(Number);
  if (!planForm.end.value || planForm.end.value <= planForm.start.value) planForm.end.value = `${pad(Math.min(h + 1, 23))}:${pad(h + 1 > 23 ? 59 : m)}`;
});

function openPlanDialog(plan, dateStr) {
  editing = plan;
  planForm.reset();
  document.getElementById('planError').hidden = true;
  document.getElementById('planDialogTitle').textContent = plan ? 'Planı düzenle' : 'Yeni plan';
  document.getElementById('deletePlanBtn').hidden = !plan;
  document.getElementById('seriesHint').hidden = !(plan && plan.repeat !== 'none');
  if (plan) {
    const s = new Date(plan.start_at), e = new Date(plan.end_at);
    planForm.title.value = plan.title;
    planForm.date.value = ymd(s);
    planForm.start.value = hm(s);
    planForm.end.value = hm(e);
    planForm.category.value = plan.category;
    planForm.repeat.value = plan.repeat;
    planForm.repeat_until.value = plan.repeat_until || '';
    planForm.note.value = plan.note;
    planForm.is_private.checked = plan.is_private;
  } else {
    const now = new Date();
    planForm.date.value = dateStr || ymd(now);
    const h = Math.min(now.getHours() + 1, 22);
    planForm.start.value = `${pad(h)}:00`;
    planForm.end.value = `${pad(h + 1)}:00`;
    planForm.category.value = 'genel';
  }
  syncRepeatUI();
  planDialog.showModal();
  if (!plan) setTimeout(() => planForm.title.focus(), 50);
}

planForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = planForm;
  const start = parseLocal(f.date.value, f.start.value);
  let end = parseLocal(f.date.value, f.end.value);
  if (end <= start) end = addDays(end, 1); // crosses midnight
  const row = {
    title: f.title.value.trim(),
    note: f.note.value.trim(),
    category: f.category.value,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    repeat: f.repeat.value,
    repeat_until: f.repeat.value === 'none' || f.repeat.value === 'yearly' ? null : (f.repeat_until.value || null),
    is_private: f.is_private.checked,
  };
  const btn = document.getElementById('savePlanBtn');
  btn.disabled = true;
  const { error } = editing
    ? await sb.from('plans').update(row).eq('id', editing.id)
    : await sb.from('plans').insert(row);
  btn.disabled = false;
  if (error) { const el = document.getElementById('planError'); el.textContent = 'Kaydedilemedi: ' + error.message; el.hidden = false; return; }
  planDialog.close();
  toast(editing ? 'Plan güncellendi' : 'Plan eklendi');
  render();
});
document.getElementById('cancelPlanBtn').addEventListener('click', () => planDialog.close());
document.getElementById('deletePlanBtn').addEventListener('click', async () => {
  if (!editing) return;
  const msg = editing.repeat !== 'none' ? 'Bu tekrarlanan planın tüm tekrarları silinecek. Emin misin?' : 'Bu plan silinsin mi?';
  if (!confirm(msg)) return;
  const { error } = await sb.from('plans').delete().eq('id', editing.id);
  if (error) { toast('Silinemedi: ' + error.message); return; }
  planDialog.close();
  toast('Plan silindi');
  render();
});

/* ================= view dialog (other people's plans) ================= */
const viewDialog = document.getElementById('viewDialog');
function openView(p, occStart) {
  const cat = CAT[p.category] || CAT.genel;
  const owner = profileOf(p.user_id);
  const s = occStart || new Date(p.start_at);
  const e = new Date(s.getTime() + (new Date(p.end_at) - new Date(p.start_at)));
  document.getElementById('viewBody').innerHTML = `
    <p class="hint" style="color:${owner.color};font-weight:600">${esc(owner.full_name)}</p>
    <h2>${esc(p.title)}</h2>
    <p>${fmtDay(s)}, ${hm(s)}–${hm(e)}</p>
    <p><span class="tag">${esc(cat.name)}</span> ${p.repeat !== 'none' ? `<span class="tag">↻ ${REPEAT_LABEL[p.repeat]}</span>` : ''}</p>
    ${p.note ? `<p style="white-space:pre-wrap;margin-top:10px">${esc(p.note)}</p>` : ''}`;
  viewDialog.showModal();
}
document.getElementById('closeViewBtn').addEventListener('click', () => viewDialog.close());

/* ================= profile dialog ================= */
const profileDialog = document.getElementById('profileDialog');
const profileForm = document.getElementById('profileForm');
let pickedColor = null;
async function openProfileDialog() {
  const p = state.profile;
  pickedColor = p.color;
  profileForm.full_name.value = p.full_name;
  document.getElementById('profileError').hidden = true;
  const sw = document.getElementById('swatches');
  sw.innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" class="${c === p.color ? 'sel' : ''}" aria-label="Renk"></button>`).join('');
  sw.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    pickedColor = b.dataset.c; sw.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
  }));
  const tb = document.getElementById('teamBox');
  if (p.is_member) {
    const { data: code } = await sb.rpc('get_team_code');
    tb.innerHTML = `<label>Ekip kodu (yeni üyelere ver)<div class="teamcode">${esc(code || '—')}</div></label>
      <p class="hint">Giriş e-postan: ${esc(state.session.user.email)}</p>`;
  } else {
    tb.innerHTML = '<p class="hint">Henüz ekipte değilsin. Ana sayfadaki kutuya ekip kodunu gir.</p>';
  }
  profileDialog.showModal();
}
profileForm.addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.from('profiles').update({ full_name: profileForm.full_name.value.trim(), color: pickedColor }).eq('id', state.profile.id);
  if (error) { const el = document.getElementById('profileError'); el.textContent = error.message; el.hidden = false; return; }
  profileDialog.close();
  await loadProfile();
  render();
});
document.getElementById('cancelProfileBtn').addEventListener('click', () => profileDialog.close());
document.getElementById('logoutBtn').addEventListener('click', async () => { profileDialog.close(); await sb.auth.signOut(); });

/* ================= auth ================= */
let authMode = 'login';
function renderAuth(msg) {
  const reg = authMode === 'register';
  $app.innerHTML = `<div class="auth"><div class="card">
    <h1>📅 Haftalık Plan</h1>
    <p class="lead">Bugün ne yapacağını gör, haftanı planla, ekibin ne yaptığını takip et.</p>
    <div class="switch">
      <button data-mode="login" class="${!reg ? 'active' : ''}">Giriş yap</button>
      <button data-mode="register" class="${reg ? 'active' : ''}">Hesap oluştur</button>
    </div>
    <form id="authForm">
      ${reg ? '<label>Adın Soyadın<input name="full_name" required maxlength="60" autocomplete="name"></label>' : ''}
      <label>E-posta<input name="email" type="email" required autocomplete="email"></label>
      <label>Şifre<input name="password" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      ${reg ? '<label>Ekip kodu<input name="code" placeholder="Ekip yöneticisinden al" autocomplete="off" style="text-transform:uppercase"></label>' : ''}
      ${msg ? `<p class="${msg.ok ? 'ok' : 'error'}">${esc(msg.text)}</p>` : ''}
      <button class="full primary" id="authBtn">${reg ? 'Hesap oluştur' : 'Giriş yap'}</button>
    </form>
  </div></div>`;
  $app.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { authMode = b.dataset.mode; renderAuth(); }));
  const form = document.getElementById('authForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = document.getElementById('authBtn');
    btn.disabled = true; btn.textContent = 'Bekle…';
    const email = String(fd.get('email')).trim(), password = String(fd.get('password'));
    if (reg) {
      const code = String(fd.get('code') || '').trim();
      if (code) localSet('pendingCode', code);
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: String(fd.get('full_name')).trim() }, emailRedirectTo: location.origin + location.pathname } });
      if (error) return renderAuth({ text: trError(error.message) });
      if (!data.session) { authMode = 'login'; return renderAuth({ ok: true, text: 'Hesap oluşturuldu. E-postana gelen onay bağlantısına tıkla, sonra giriş yap.' }); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return renderAuth({ text: trError(error.message) });
    }
  });
}
function trError(m) {
  if (/Invalid login/i.test(m)) return 'E-posta ya da şifre hatalı.';
  if (/not confirmed/i.test(m)) return 'E-postan henüz onaylanmadı. Gelen kutundaki bağlantıya tıkla.';
  if (/already registered/i.test(m)) return 'Bu e-postayla zaten bir hesap var. Giriş yap.';
  if (/rate limit/i.test(m)) return 'Çok fazla deneme oldu. Biraz sonra tekrar dene.';
  if (/at least 6/i.test(m)) return 'Şifre en az 6 karakter olmalı.';
  return m;
}

/* ================= realtime ================= */
let rerenderTimer = null;
function subscribeRealtime() {
  if (state.channel) sb.removeChannel(state.channel);
  state.channel = sb.channel('plans-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, () => {
      clearTimeout(rerenderTimer);
      rerenderTimer = setTimeout(() => { if (!document.querySelector('dialog[open]')) render(); }, 400);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => { await loadProfile(); render(); })
    .subscribe();
}

/* ================= toast ================= */
let toastTimer;
function toast(t) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = t;
  document.body.appendChild(el);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2600);
}

/* ================= boot ================= */
async function onSession(session) {
  state.session = session;
  if (!session) { if (state.channel) sb.removeChannel(state.channel); state.channel = null; return renderAuth(); }
  await loadProfile();
  const pending = localGet('pendingCode');
  if (pending && !state.profile.is_member) {
    const { data } = await sb.rpc('join_team', { code: pending });
    try { localStorage.removeItem('pendingCode'); } catch {}
    if (data) await loadProfile(); else toast('Ekip kodu hatalıydı. Ana sayfadan tekrar gir.');
  }
  subscribeRealtime();
  render();
}

let lastUid;
sb.auth.onAuthStateChange((event, session) => {
  const uid = session?.user?.id;
  if (event === 'TOKEN_REFRESHED' && uid === lastUid) { state.session = session; return; }
  if (uid === lastUid && event !== 'INITIAL_SESSION' && event !== 'SIGNED_OUT') return;
  lastUid = uid;
  setTimeout(() => onSession(session), 0);
});

// refresh the "now" highlight every minute and when the app comes back to the foreground
setInterval(() => { if (state.session && !document.querySelector('dialog[open]')) render(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.session) render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
