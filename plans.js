/* Plans & 3D model for the Al-Bashara 1 villa — drawn from the owner's hand sketches.
   Usage: Plans.site(el, lang), Plans.foot(el, lang), Plans.model(canvasWrap, lang) */
(function () {
  const T = {
    tr: { house: "Ev", green: "Yeşil alan", greenE: "Yeşil alan (230 m²)", garage: "Garaj girişi", door: "Kapı", wc: "Avlu tuvaleti", base: "Bodrum girişi (rampa)", yard: "Avlu", ramp: "Rampa", foot: "Ev oturumu (taslak)", rotate: "Döndür", ghost: "Eklenebilecek katlar", drag: "Sürükleyerek çevir" },
    ar: { house: "الفيلا", green: "مساحة خضراء", greenE: "مساحة خضراء 230 م²", garage: "مدخل السيارات", door: "باب", wc: "حمام الحوش", base: "مدخل البدروم (مزلقان)", yard: "الحوش", ramp: "مزلقان", foot: "مسقط المبنى (تقريبي)", rotate: "تدوير", ghost: "الطوابق الممكن إضافتها", drag: "اسحب للتدوير" },
    en: { house: "Villa", green: "Green area", greenE: "Green space 230 m²", garage: "Car entrance", door: "Door", wc: "Courtyard WC", base: "Basement entrance (ramp)", yard: "Courtyard", ramp: "Ramp", foot: "Building footprint (approx.)", rotate: "Rotate", ghost: "Floors that can be added", drag: "Drag to rotate" }
  };
  const C = { ink: "var(--ink,#1c1814)", mut: "var(--mut,#6c6259)", sand: "#d9a352", sandL: "#efd3a0", green: "#7fb377", greenD: "#4d8a4b", wall: "#1c1814", ramp: "#b9ab9a" };
  const ns = "http://www.w3.org/2000/svg";
  const t = (lang, k) => (T[lang] || T.en)[k];
  const lbl = (x, y, s, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || "middle"}" font-size="${o.fs || 26}" font-weight="${o.fw || 600}" fill="${o.fill || C.ink}" ${o.rot ? `transform="rotate(${o.rot} ${x} ${y})"` : ""}>${s}</text>`;

  const OUT = [[170, 735], [315, 655], [405, 740], [790, 722], [838, 1132], [1028, 1140], [1040, 1398], [255, 1420], [248, 1205], [500, 1190], [496, 1112], [474, 1092], [474, 1078], [490, 1046], [482, 1012], [432, 968], [402, 962], [402, 935]];
  /* ---------- 1. Site plan (sketch 1) ---------- */
  function site(el, lang) {
    const W = 6; // wall thickness
    const walls = [
      [100, 1300, 100, 925], [100, 830, 100, 280], [100, 280, 155, 280],
      [275, 280, 460, 280], [520, 280, 800, 280], [800, 280, 800, 820],
      [985, 945, 985, 1030], [985, 1215, 985, 1300], [985, 1300, 100, 1300]
    ].map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join("");
    const posts = [[155, 280], [275, 280], [460, 280], [520, 280], [100, 925], [100, 830], [985, 1030], [985, 1215]]
      .map(([x, y]) => `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="${C.wall}"/>`).join("");
    const chev = [0, 1, 2, 3].map(i => `<path d="M${935 - i * 38} 1095 l-22 32 l22 32" fill="none" stroke="${C.ink}" stroke-width="4" opacity=".55"/>`).join("");
    el.innerHTML = `<svg viewBox="30 150 1090 1200" style="direction:ltr;width:100%;height:auto;display:block" font-family="inherit" role="img" aria-label="Site plan">
      <rect x="100" y="280" width="885" height="1020" fill="${C.sandL}" opacity=".35"/>
      <rect x="800" y="280" width="185" height="540" fill="var(--bg,#fbf8f3)"/><path d="M806 280 H1095 V820 H806 Z" fill="${C.green}" opacity=".55"/>${[[870, 360], [1050, 560], [1050, 380], [880, 680], [1040, 740]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="22" fill="${C.greenD}" opacity=".8"/>`).join("")}<g transform="translate(1060 210)"><circle r="34" fill="${C.ink}"/><path d="M0 -24 L13 8 L0 2 L-13 8 Z" fill="#fff"/><text y="27" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">N</text></g>
      <rect x="305" y="515" width="175" height="100" rx="6" fill="${C.green}"/><rect x="600" y="525" width="155" height="115" rx="6" fill="${C.green}"/>
      ${[[340, 555], [440, 590], [640, 560], [720, 610]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="20" fill="${C.greenD}"/>`).join("")}
      <polygon points="${OUT.map(([x, y]) => [542.5 + (x - 605) * 0.604, 970 + (y - 1037.5) * 0.604].map(v => v.toFixed(1)).join(",")).join(" ")}" fill="${C.sand}" stroke="${C.wall}" stroke-width="5" stroke-linejoin="round"/>
      <rect x="800" y="820" width="180" height="125" fill="#fff" stroke="${C.wall}" stroke-width="5"/>
      <rect x="800" y="1040" width="180" height="170" fill="${C.ramp}" opacity=".6"/>${chev}
      <g stroke="${C.wall}" stroke-width="${W * 2}" stroke-linecap="square">${walls}</g>${posts}
      <path d="M215 210 v52" stroke="${C.ink}" stroke-width="4" marker-end="url(#ar)"/>
      <path d="M1070 1127 h-60" stroke="${C.ink}" stroke-width="4" marker-end="url(#ar)"/>
      <defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.ink}"/></marker></defs>
      ${lbl(215, 195, t(lang, "garage"), { fs: 24 })}
      ${lbl(490, 262, t(lang, "door"), { fs: 20, fw: 500, fill: C.mut })}
      ${lbl(70, 878, t(lang, "door"), { fs: 20, fw: 500, fill: C.mut, rot: -90 })}
      ${lbl(392, 655, t(lang, "green"), { fs: 20, fw: 500 })}${lbl(677, 665, t(lang, "green"), { fs: 20, fw: 500 })}
      ${lbl(560, 1000, t(lang, "house"), { fs: 40, fw: 800 })}${lbl(950, 560, t(lang, "greenE"), { fs: 22, fw: 600, rot: 90 })}
      ${lbl(890, 890, t(lang, "wc"), { fs: 20 })}
      ${lbl(890, 1245, t(lang, "base").split(" (")[0], { fs: 20 })}${lbl(890, 1268, t(lang, "ramp"), { fs: 17, fw: 500, fill: C.mut })}
      ${lbl(200, 1080, t(lang, "yard"), { fs: 22, fw: 500, fill: C.mut, rot: -90 })}
    </svg>`;
  }

  /* ---------- 2. Footprint (sketch 2) ---------- */
  function foot(el, lang) {
    const pts = OUT.map(p => p.join(",")).join(" ");
    el.innerHTML = `<svg viewBox="130 610 950 850" style="direction:ltr;width:100%;height:auto;display:block" role="img" aria-label="Footprint">
      <polygon points="${pts}" fill="${C.sand}" stroke="${C.wall}" stroke-width="10" stroke-linejoin="round"/>
      <g stroke="${C.wall}" stroke-width="6" fill="none"><path d="M405 740 L556 880 L655 877"/><path d="M700 875 L795 872"/></g>
      <g stroke="var(--bg,#fbf8f3)" stroke-width="14"><line x1="402" y1="950" x2="430" y2="968"/><line x1="474" y1="1080" x2="474" y2="1092"/><line x1="660" y1="877" x2="695" y2="876"/></g>
      <g stroke="${C.wall}" stroke-width="3" fill="none"><path d="M660 877 A35 35 0 0 1 690 845"/></g>
      ${lbl(640, 1290, t(lang, "foot"), { fs: 30, fw: 700 })}
    </svg>`;
  }

  /* ---------- 3. 3D model of the footprint ---------- */
  function model(wrap, lang) {
    const S = 1 / 52, cx = 605, cy = 1040, H = 3.3, FL = 2, PAR = 0.7;
    let poly = OUT.map(([x, y]) => [(x - cx) * S, (y - cy) * S]);
    let area = 0; poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; });
    const ccw = area > 0; // in x-right, z-down plan coords
    // split edges into short segments for better depth sorting + window rhythm
    const segs = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = Math.max(1, Math.round(L / 2.4));
      let nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L; if (!ccw) { nx = -nx; nz = -nz; }
      for (let k = 0; k < n; k++) segs.push({ a: [p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n], b: [p[0] + (q[0] - p[0]) * (k + 1) / n, p[1] + (q[1] - p[1]) * (k + 1) / n], n: [nx, nz], len: L / n });
    });
    wrap.innerHTML = `<canvas style="width:100%;height:100%;display:block;touch-action:none;cursor:grab"></canvas>
      <div style="position:absolute;inset-inline-start:10px;bottom:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-b="spin" aria-pressed="true">${t(lang, "rotate")}</button>
        <button type="button" data-b="ghost" aria-pressed="false">${t(lang, "ghost")}</button></div>
      <span style="position:absolute;inset-inline-end:12px;top:10px;font-size:13px;color:var(--mut,#6c6259)">${t(lang, "drag")}</span>`;
    const cv = wrap.querySelector("canvas"), g = cv.getContext("2d");
    let yaw = -0.7, pitch = 0.52, spin = true, ghost = false, drag = null;
    const L = (() => { const v = [-0.5, 0.8, -0.35], m = Math.hypot(...v); return v.map(x => x / m); })();
    function shade(hex, f) { const n = parseInt(hex.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.min(255, Math.round(((n >> s) & 255) * f))).join(",")})`; }
    function draw() {
      const W = cv.clientWidth, Hh = cv.clientHeight, d = devicePixelRatio || 1;
      if (cv.width !== W * d) { cv.width = W * d; cv.height = Hh * d; }
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, Hh);
      const cs = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const top = (ghost ? FL + 3 : FL) * H + PAR;
      const sc = Math.min(W / 30, Hh / (14 + top * 0.9));
      const ox = W / 2, oy = Hh * 0.5 + top * cp * sc * 0.42;
      const P = (x, y, z) => { const xr = x * cs - z * sn, zr = x * sn + z * cs; return [ox + xr * sc, oy + (-y * cp + zr * sp) * sc, zr * cp + y * sp]; };
      const faces = [];
      const poly3 = (pts, fill, stroke, alpha, depthBias = 0) => { const pr = pts.map(p => P(...p)); faces.push({ pr, fill, stroke, alpha, d: pr.reduce((a, p) => a + p[2], 0) / pr.length + depthBias }); };
      // ground + shadow
      const gr = 15; const gpts = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; gpts.push([Math.cos(a) * gr, 0, Math.sin(a) * gr * 0.9]); }
      const gp = gpts.map(p => P(...p)); g.beginPath(); gp.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = "#e3c99d"; g.fill();
      const sh = poly.map(([x, z]) => P(x + 1.6, 0, z + 1.2)); g.beginPath(); sh.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = "rgba(60,40,20,.25)"; g.fill();
      const visible = s => s.n[0] * sn + s.n[1] * cs > 0.02;
      const lit = s => 0.8 + 0.32 * Math.max(0, s.n[0] * L[0] + s.n[1] * L[2]);
      for (let f = 0; f < FL; f++) {
        const y0 = f * H, y1 = y0 + H;
        segs.forEach(s => {
          if (!visible(s)) return;
          const k = lit(s), [ax, az] = s.a, [bx, bz] = s.b;
          poly3([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], shade(f ? "#d9a352" : "#e2b062", k), "rgba(80,50,20,.12)", 1);
          poly3([[ax, y1 - 0.32, az], [bx, y1 - 0.32, bz], [bx, y1, bz], [ax, y1, az]], shade("#c79145", k), null, 1, 0.001);
          if (s.len > 1.3) { const m = 0.5, w = 0.42 / s.len, wy0 = y0 + 0.95, wy1 = y0 + 2.35;
            const ix = t2 => ax + (bx - ax) * t2, iz = t2 => az + (bz - az) * t2, o = 0.03;
            poly3([[ix(m - w) + s.n[0] * o, wy0, iz(m - w) + s.n[1] * o], [ix(m + w) + s.n[0] * o, wy0, iz(m + w) + s.n[1] * o], [ix(m + w) + s.n[0] * o, wy1, iz(m + w) + s.n[1] * o], [ix(m - w) + s.n[0] * o, wy1, iz(m - w) + s.n[1] * o]], shade("#4a3a2c", k), "#f4e3c4", 1, 0.002); }
        });
      }
      const yt = FL * H;
      segs.forEach(s => { if (!visible(s)) return; const k = lit(s), [ax, az] = s.a, [bx, bz] = s.b;
        poly3([[ax, yt, az], [bx, yt, bz], [bx, yt + PAR, bz], [ax, yt + PAR, az]], shade("#b5653f", k), "rgba(60,25,10,.35)", 1); });
      faces.sort((a, b) => a.d - b.d);
      const paint = fc => { g.beginPath(); fc.pr.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.globalAlpha = fc.alpha; g.fillStyle = fc.fill; g.fill(); if (fc.stroke) { g.strokeStyle = fc.stroke; g.lineWidth = 1; g.stroke(); } g.globalAlpha = 1; };
      faces.forEach(paint);
      const rf = poly.map(([x, z]) => P(x, yt + PAR, z)); g.beginPath(); rf.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = "#efe4d2"; g.fill(); g.strokeStyle = "#8a4a2c"; g.lineWidth = 1.5; g.stroke();
      if (ghost) {
        g.setLineDash([6, 5]); g.strokeStyle = "rgba(28,24,20,.55)"; g.lineWidth = 1.2;
        for (let f = 0; f <= 3; f++) { const y = yt + PAR + f * H; const r = poly.map(([x, z]) => P(x, y, z)); g.beginPath(); r.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = "rgba(217,163,82,.10)"; g.fill(); g.stroke(); }
        poly.forEach(([x, z]) => { const a = P(x, yt + PAR, z), b = P(x, yt + PAR + 3 * H, z); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
        g.setLineDash([]);
      }
    }
    const loop = () => { if (spin && !drag) yaw += 0.004; draw(); raf = requestAnimationFrame(loop); };
    let raf = requestAnimationFrame(loop);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { spin = false; }
    cv.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
    cv.addEventListener("pointermove", e => { if (!drag) return; yaw = drag.yaw - (e.clientX - drag.x) * 0.01; pitch = Math.max(0.15, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.006)); });
    const up = () => { drag = null; cv.style.cursor = "grab"; }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    wrap.querySelectorAll("[data-b]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.b === "spin") spin = !spin; else ghost = !ghost;
      b.setAttribute("aria-pressed", b.dataset.b === "spin" ? spin : ghost);
    }));
    return { set(o) { if ("yaw" in o) yaw = o.yaw; if ("spin" in o) spin = o.spin; if ("ghost" in o) ghost = o.ghost; draw(); } };
  }
  window.Plans = { site, foot, model };
})();
