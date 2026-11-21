// 3D model of the Al-Bashara 1 villa.
// Footprint = owner's sketch 2, plot = sketch 1 (both north-up), façade details = pre-war photo (west façade).
// World axes: +x = east, -z = north, +y = up. Units ≈ metres.
// mountModel(container, opts) -> { setGhost, setSpin, view(name), render, dispose }
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";

const S2 = 0.0145, S1 = 0.024;                       // metres per sketch pixel (sketch 2, sketch 1)
const P2 = ([x, y]) => [(x - 605) * S2, (y - 1037.5) * S2];
const P1 = ([x, y]) => [(x - 542.5) * S1, (y - 970) * S1];
const FH = 3.3, TOP = 2 * FH;

const OUT = [[170, 735], [315, 655], [405, 740], [790, 722], [838, 1132], [1028, 1140], [1040, 1398], [255, 1420], [248, 1205], [500, 1190], [496, 1112], [474, 1092], [474, 1078], [490, 1046], [482, 1012], [432, 968], [402, 962], [402, 935]];
const WING = [[170, 735], [315, 655], [556, 880], [432, 968], [402, 962], [402, 935]];
const CORE = [[405, 740], [790, 722], [838, 1132], [838, 1186], [500, 1190], [496, 1112], [474, 1092], [474, 1078], [490, 1046], [482, 1012], [432, 968], [556, 880]];
const SOUTH = [[248, 1205], [500, 1190], [838, 1186], [838, 1132], [1028, 1140], [1040, 1398], [255, 1420]];
const TOWER = [[480, 936], [572, 926], [578, 1016], [490, 1022]];

function tex(draw, w = 128, h = 128) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const tileTex = () => tex((g, w, h) => {
  g.fillStyle = "#b8643c"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { g.fillStyle = "rgba(70,25,10,.45)"; g.fillRect(0, y + 12, w, 4); g.fillStyle = "rgba(255,190,150,.18)"; g.fillRect(0, y, w, 3);
    for (let x = (y / 16 % 2) * 10; x < w; x += 20) { g.fillStyle = "rgba(70,25,10,.25)"; g.fillRect(x, y, 2, 12); } }
});
const fenceTex = () => tex((g, w, h) => { for (let x = 0; x < w; x++) { const v = 150 + 40 * Math.sin(x / w * Math.PI * 16); g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(x, 0, 1, h); } });
const wallTex = () => { const t = tex((g, w, h) => { g.fillStyle = "#d9ad68"; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? "255,240,210" : "120,80,30"},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }); t.repeat.set(0.4, 0.4); return t; };
const grassTex = () => tex((g, w, h) => { g.fillStyle = "#7fae5c"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? "40,90,30" : "190,220,140"},.18)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
const labelTex = (txt, bg = "rgba(28,24,20,.85)") => { const c = document.createElement("canvas"); c.width = 256; c.height = 256; const g = c.getContext("2d");
  g.fillStyle = bg; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(128, 30); g.lineTo(175, 120); g.lineTo(81, 120); g.fill();
  g.font = "bold 90px system-ui,sans-serif"; g.textAlign = "center"; g.fillText(txt, 128, 215); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

function inside(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi) + xi) c = !c; } return c; }
function edges(poly) { // world-space edges with outward normals
  return poly.map((a, i) => { const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); let n = [dz / L, -dx / L];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (inside([mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05], poly)) n = [-n[0], -n[1]]; return { a, b, L, n, mid }; });
}

export function mountModel(el, opts = {}) {
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) return null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#cdd8e8"); scene.fog = new THREE.Fog("#cdd8e8", 80, 160);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts.capture });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement); renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 10, maxDistance: 80, maxPolarAngle: 1.45, enablePan: false, autoRotate: true, autoRotateSpeed: 0.5 });
  const VIEWS = { west: [[-27, 4.6, 2.5], [0, 3, 0.5]], aerial: [[-24, 34, 26], [1, 0, -1]], east: [[30, 9, 6], [1, 2, 0]], north: [[-4, 10, -34], [0, 2, 0]] };
  const view = n => { const [p, t] = VIEWS[n] || VIEWS.west; camera.position.set(...p); controls.target.set(...t); controls.update(); };
  view("west");

  scene.add(new THREE.HemisphereLight("#eef3ff", "#b88a5a", 1.15));
  const sun = new THREE.DirectionalLight("#fff1dc", 2.6); sun.position.set(-20, 28, 14); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; scene.add(sun);

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.92 }), soffit: new THREE.MeshStandardMaterial({ color: "#efe3cb", roughness: 0.9 }),
    cornice: new THREE.MeshStandardMaterial({ color: "#c79a5c", roughness: 0.9 }), roof: new THREE.MeshStandardMaterial({ color: "#d8cbb5", roughness: 1 }),
    frame: new THREE.MeshStandardMaterial({ color: "#9a5a36", roughness: 0.7 }), glass: new THREE.MeshStandardMaterial({ color: "#2f2a26", roughness: 0.25, metalness: 0.3 }),
    glassL: new THREE.MeshStandardMaterial({ color: "#e9eef3", roughness: 0.3 }), ac: new THREE.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.6 }),
    pillar: new THREE.MeshStandardMaterial({ color: "#bdb3a5", roughness: 0.9 }), gate: new THREE.MeshStandardMaterial({ color: "#2a2623", roughness: 0.6, metalness: 0.4 }),
    plot: new THREE.MeshStandardMaterial({ color: "#d9b98c", roughness: 1 }), dirt: new THREE.MeshStandardMaterial({ color: "#c7976a", roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: "#a9a196", roughness: 0.95 }), dark: new THREE.MeshStandardMaterial({ color: "#1f1b18", roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 }), leaf: new THREE.MeshStandardMaterial({ color: "#4f8a3f", roughness: 0.9, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: "#7a5636", roughness: 1 })
  };
  const tileMat = (rx, ry) => { const t = tileTex(); t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }); };
  const fenceMat = rx => { const t = fenceTex(); t.repeat.set(rx, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.35 }); };

  const house = new THREE.Group(); scene.add(house);
  const shadow = m => { m.castShadow = m.receiveShadow = true; return m; };
  const box = (x0, x1, y0, y1, z0, z1, mat, parent = house) => { const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m); return m; };
  const extrude = (poly, y0, y1, mats, parent = house) => {
    const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    const m = shadow(new THREE.Mesh(g, mats)); m.position.y = y0; parent.add(m); return m;
  };
  // a group sitting on an edge: local +z = outward normal, local x = along the edge
  const onEdge = (e, t = 0.5) => { const g = new THREE.Group(); g.position.set(e.a[0] + (e.b[0] - e.a[0]) * t, 0, e.a[1] + (e.b[1] - e.a[1]) * t); g.rotation.y = Math.atan2(e.n[0], e.n[1]); house.add(g); return g; };
  const tileBand = (g, x0, x1, yTop, z, out = 1, drop = 0.75) => {
    const len = Math.hypot(out, drop); const b = box(x0, x1, -0.07, 0.07, -len / 2, len / 2, tileMat((x1 - x0) / 1.2, len / 0.6), g);
    b.position.set((x0 + x1) / 2, yTop - drop / 2, z + out / 2); b.rotation.x = Math.atan2(drop, out);
    box(x0, x1, yTop - drop - 0.18, yTop - drop, z + out - 0.05, z + out + 0.08, M.soffit, g);
  };
  const win = (g, x, y, w = 0.8, h = 1.1, light = false) => {
    box(x - w / 2 - 0.1, x + w / 2 + 0.1, y - h / 2 - 0.1, y + h / 2 + 0.1, -0.02, 0.06, M.frame, g);
    box(x - w / 2, x + w / 2, y - h / 2, y + h / 2, 0, 0.09, light ? M.glassL : M.glass, g);
    if (light) { box(x - 0.03, x + 0.03, y - h / 2, y + h / 2, 0.09, 0.12, M.frame, g); box(x - w / 2, x + w / 2, y - 0.03, y + 0.03, 0.09, 0.12, M.frame, g); }
  };
  const ac = (g, x, y) => { box(x - 0.42, x + 0.42, y - 0.3, y + 0.3, 0, 0.45, M.ac, g); box(x - 0.36, x + 0.36, y - 0.24, y + 0.24, 0.45, 0.47, M.glass, g); };
  const col = (g, x, z, y0, y1, r = 0.2) => box(x - r, x + r, y0, y1, z - r, z + r, M.wall, g);
  // porch / terrace on an edge: slab at `level`, tiled band on its edge, columns
  const porch = (e, level, out, ncol = 2, t0 = 0, t1 = 1) => {
    const g = onEdge(e, (t0 + t1) / 2), L = e.L * (t1 - t0);
    box(-L / 2 - 0.15, L / 2 + 0.15, level - 0.28, level, -0.05, out, M.soffit, g);
    tileBand(g, -L / 2 - 0.3, L / 2 + 0.3, level + 0.75, out - 0.15, 0.7, 0.62);
    for (let i = 0; i < ncol; i++) { const x = ncol === 1 ? 0 : -L / 2 + 0.35 + (L - 0.7) * i / (ncol - 1); col(g, x, out - 0.35, level - FH, level - 0.28); }
    return g;
  };

  const W = WING.map(P2), C = CORE.map(P2), SO = SOUTH.map(P2), TW = TOWER.map(P2), O = OUT.map(P2);
  // ---- masses
  [W, C, SO].forEach(p => { extrude(p, 0, TOP, [M.roof, M.wall]); extrude(p, TOP, TOP + 0.4, [M.roof, M.cornice]); });
  extrude(TW, TOP + 0.4, TOP + 1.5, [M.roof, M.wall]); extrude(TW, TOP + 1.5, TOP + 1.75, [M.roof, M.cornice]);

  const EO = edges(O), eW = edges(W), eTW = edges(TW), eS = edges(SO);
  const westish = e => e.n[0] < -0.5;
  // ---- windows on every outer wall (both floors)
  EO.forEach(e => {
    if (e.L < 1.3) return; const n = Math.max(1, Math.floor(e.L / 2.7)); const g = onEdge(e);
    for (let i = 0; i < n; i++) { const x = -e.L / 2 + e.L * (i + 0.5) / n; win(g, x, 1.55, 0.8, 1.1); win(g, x, FH + 1.6, 0.8, 1.1); }
  });
  // ---- west façade details (photo)
  const longestFacing = (es, minDot) => es.filter(e => e.n[0] < minDot).reduce((a, e) => (e.L > a.L ? e : a));
  const wingSW = longestFacing(eW, -0.4);       // wing's long west/south-west face
  porch(wingSW, FH, 1.4, 2, 0.08, 0.92);                                                        // tiled eave + columns under the upper floor
  { const g = onEdge(wingSW); ac(g, wingSW.L * 0.32, FH + 2.2); }
  const southW = longestFacing(eS, -0.9);                              // south block west face
  porch(southW, FH, 2.4, 3); porch(southW, TOP, 2.4, 3);                                       // two stacked terraces with columns
  const twW = longestFacing(eTW, -0.9);                                 // tower west face: vertical slits
  { const g = onEdge(twW); [-0.35, 0, 0.35].forEach(x => box(x - 0.06, x + 0.06, TOP + 0.55, TOP + 1.35, 0, 0.06, M.glass, g)); ac(g, 0.4, FH + 1.9);
    // curved parapet rising from the wing roof to the tower (the "hump")
    const s = new THREE.Shape(); s.moveTo(-2.6, 0); s.bezierCurveTo(-1.4, 0, -1.6, 1.1, -0.6, 1.1); s.lineTo(0, 1.1); s.lineTo(0, 0); s.lineTo(-2.6, 0);
    const m = shadow(new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false }), M.wall)); m.position.set(-twW.L / 2, TOP + 0.4, -0.3); g.add(m); }
  // entrance on the recessed curved wall: door, small tiled eave, big window above
  { const e = { a: P2([496, 1112]), b: P2([500, 1190]) }; e.L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); e.n = [-1, 0];
    const g = onEdge(e, 0.15); box(-0.55, 0.55, 0, 2.3, -0.02, 0.08, M.gate, g); tileBand(g, -1.1, 1.1, 3.05, 0.05, 0.75, 0.45);
    const g2 = onEdge(e, 0.55); win(g2, 0, FH + 1.6, 1.0, 1.4, true); }
  { const e = { a: P2([432, 968]), b: P2([482, 1012]) }; e.L = 1; e.n = [-0.66, 0.75]; const g = onEdge(e); ac(g, 0, 2.3); }

  // ---- plot (sketch 1), fence, gates
  const PLOT = [[100, 280], [800, 280], [800, 820], [985, 820], [985, 1300], [100, 1300]].map(P1);
  const RAMP = [[800, 1045], [985, 1045], [985, 1210], [800, 1210]].map(P1);
  const shapeOf = (poly, holes = []) => { const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))); holes.forEach(h => s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))))); return s; };
  const flat = (shape, mat, y) => { const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.y = y; m.receiveShadow = true; scene.add(m); return m; };
  const rampHole = RAMP;
  flat(shapeOf([[-120, -120], [120, -120], [120, 120], [-120, 120]], [PLOT]), M.dirt, 0);
  flat(shapeOf(PLOT, [rampHole]), M.plot, 0.01);
  // green space to the east (≈230 m²)
  const GREEN = [P1([800, 280]), [P1([985, 280])[0] + 7, P1([800, 280])[1]], [P1([985, 820])[0] + 7, P1([985, 820])[1]], P1([800, 820])];
  flat(shapeOf(GREEN), M.grass, 0.02);
  const tree = (x, z, s = 1) => { const t = new THREE.Group(); const tr = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.6 * s, 6), M.trunk)); tr.position.y = 0.8 * s; t.add(tr);
    const c = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 0), M.leaf)); c.position.y = 2.2 * s; t.add(c); t.position.set(x, 0, z); scene.add(t); };
  [[9, -13.5], [13.5, -11], [10.5, -7], [15, -5.5]].forEach(([x, z], i) => tree(x, z, 1 + (i % 2) * 0.3));
  // green beds inside the plot (north)
  [[[305, 515], [480, 615]], [[600, 525], [755, 640]]].forEach(([a, b]) => { const [x0, z0] = P1(a), [x1, z1] = P1(b); box(x0, x1, 0, 0.25, z0, z1, M.concrete, scene); box(x0 + 0.1, x1 - 0.1, 0.25, 0.27, z0 + 0.1, z1 - 0.1, M.grass, scene); tree(x0 + 1, (z0 + z1) / 2, 0.8); tree(x1 - 1, (z0 + z1) / 2, 0.7); });
  // basement ramp (east)
  { const [x0, z0] = rampHole[0], x1 = RAMP[1][0], z1 = RAMP[2][1], depth = 2.0;
    const L = x1 - x0, ang = Math.atan2(depth, L), len = Math.hypot(L, depth);
    const r = box(-len / 2, len / 2, -0.1, 0, z0, z1, M.concrete, scene); r.position.set((x0 + x1) / 2, -depth / 2, (z0 + z1) / 2); r.rotation.z = ang;
    [z0, z1].forEach(z => box(x0, x1, -depth, 0.35, z - 0.12, z + 0.12, M.concrete, scene));
    box(x0 - 0.3, x0, -depth, 0.1, z0, z1, M.dark, scene); }
  // courtyard WC (east)
  { const [x0, z0] = P1([830, 825]), [x1, z1] = P1([978, 940]); box(x0, x1, 0, 2.7, z0, z1, M.wall, scene); box(x0 - 0.05, x1 + 0.05, 2.7, 2.9, z0 - 0.05, z1 + 0.05, M.cornice, scene);
    box(x0 - 0.06, x0, 0, 2.1, (z0 + z1) / 2 - 0.45, (z0 + z1) / 2 + 0.45, M.gate, scene); }
  // fence with openings: [from, to] in sketch-1 px; openings get gates
  const FHt = 2.3, fence = new THREE.Group(); scene.add(fence);
  const fseg = (A, B) => { const [x0, z0] = P1(A), [x1, z1] = P1(B), L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) return;
    const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(L, FHt, 0.08), fenceMat(L / 1.2))); m.position.set((x0 + x1) / 2, FHt / 2, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); fence.add(m);
    const n = Math.max(1, Math.round(L / 3.2)); for (let i = 0; i <= n; i++) { const t = i / n; box(-0.08, 0.08, 0, FHt + 0.1, -0.08, 0.08, M.pillar, fence).position.set(x0 + (x1 - x0) * t, (FHt + 0.1) / 2, z0 + (z1 - z0) * t); } };
  const pillarAt = A => { const [x, z] = P1(A); box(x - 0.32, x + 0.32, 0, FHt + 0.55, z - 0.32, z + 0.32, M.pillar, fence); box(x - 0.4, x + 0.4, FHt + 0.55, FHt + 0.7, z - 0.4, z + 0.4, M.cornice, fence); };
  const gateBetween = (A, B, slats = true) => { const [x0, z0] = P1(A), [x1, z1] = P1(B), L = Math.hypot(x1 - x0, z1 - z0); const g = box(-L / 2 + 0.3, L / 2 - 0.3, 0.05, FHt - 0.1, -0.04, 0.04, M.gate, fence);
    g.position.set((x0 + x1) / 2, FHt / 2, (z0 + z1) / 2); g.rotation.y = -Math.atan2(z1 - z0, x1 - x0); };
  fseg([100, 1300], [100, 925]); fseg([100, 830], [100, 280]); fseg([100, 280], [150, 280]); fseg([285, 280], [455, 280]); fseg([525, 280], [800, 280]);
  fseg([800, 280], [800, 825]); fseg([985, 940], [985, 1040]); fseg([985, 1215], [985, 1300]); fseg([985, 1300], [100, 1300]);
  [[100, 925], [100, 830], [150, 280], [285, 280], [455, 280], [525, 280], [985, 1040], [985, 1215]].forEach(pillarAt);
  gateBetween([100, 925], [100, 830]); gateBetween([150, 280], [285, 280]); gateBetween([455, 280], [525, 280]);
  // north arrow on the ground
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: labelTex("N"), transparent: true })); m.rotation.x = -Math.PI / 2; const [x, z] = P1([100, 280]); m.position.set(x - 3, 0.05, z - 3); scene.add(m); }

  // ---- floors that can be added (foundation built for 5)
  const ghost = new THREE.Group(); ghost.visible = false; scene.add(ghost);
  const gm = new THREE.MeshBasicMaterial({ color: "#d9a352", transparent: true, opacity: 0.12, depthWrite: false });
  const lm = new THREE.LineDashedMaterial({ color: "#3b2d18", dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 3; i++) { const m = extrude(O, TOP + 0.4 + FH * i, TOP + 0.4 + FH * (i + 1), gm, ghost); m.castShadow = m.receiveShadow = false;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), lm); e.computeLineDistances(); e.position.copy(m.position); ghost.add(e); }

  // ---- loop
  let running = true, visible = true, raf = 0;
  const size = () => { const w = el.clientWidth || 600, h = el.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 520 ? 50 : 38; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(size); ro.observe(el); size();
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) loop(); }); io.observe(el);
  controls.addEventListener("start", () => { controls.autoRotate = false; opts.onSpin && opts.onSpin(false); });
  function loop() { raf = 0; if (!running || !visible) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) controls.autoRotate = false;
  loop();
  return { setGhost(v) { ghost.visible = v; }, setSpin(v) { controls.autoRotate = v; }, view, render() { controls.update(); renderer.render(scene, camera); }, dispose() { running = false; ro.disconnect(); io.disconnect(); renderer.dispose(); el.innerHTML = ""; } };
}
