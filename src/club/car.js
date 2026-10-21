// Auto 1:32 in stile GT3: carrozzeria "loftata" per sezioni, livrea su canvas, alettone, splitter, ruote
import * as THREE from 'three';
import { canvasTex, lerp, clamp, smooth, bump } from './util.js';

export const GUIDE = 0.05;            // pattino davanti al centro auto
const L2 = 0.072;                      // mezza lunghezza (auto lunga 14.4 cm = 4.6 m reali)
const XF = 0.043, XR = -0.041;         // assali (passo 8.4 cm)
const TRACK = 0.0265;                  // mezza carreggiata
const RF = 0.0105, RR = 0.0110;        // raggi ruote
const YB = 0.0055;                     // altezza da terra del fondo

// tre sagome GT diverse (motore anteriore, centrale, posteriore/fastback)
export const STYLES = {
  front: { ws: 0.012, rf: -0.010, rr: -0.034, rw: -0.056, roofH: 0.0385, deckH: 0.0285, hoodH: 0.0235, noseH: 0.0150 },
  mid:   { ws: 0.034, rf: 0.012, rr: -0.012, rw: -0.052, roofH: 0.0370, deckH: 0.0280, hoodH: 0.0205, noseH: 0.0135 },
  back:  { ws: 0.024, rf: 0.004, rr: -0.020, rw: -0.064, roofH: 0.0390, deckH: 0.0275, hoodH: 0.0220, noseH: 0.0145 },
};

function profile(st){
  const topC = x => {
    if (x > 0.066) return lerp(st.noseH, st.noseH * 0.82, smooth(0.066, L2, x));
    if (x > st.ws) return lerp(st.hoodH, st.noseH, Math.pow(smooth(st.ws, 0.066, x), 0.9));
    if (x > st.rf){ const t = (st.ws - x) / (st.ws - st.rf); return lerp(st.hoodH + 0.0008, st.roofH, Math.pow(t, 0.85)); }
    if (x > st.rr) return st.roofH + 0.0005 * bump(x, (st.rf + st.rr) / 2, (st.rf - st.rr) / 2);
    if (x > st.rw){ const t = (st.rr - x) / (st.rr - st.rw); return lerp(st.roofH, st.deckH, Math.pow(t, 1.25)); }
    if (x > -0.067) return st.deckH;
    return st.deckH + 0.0012 * smooth(-0.067, -L2, x);               // piccolo spoiler "ducktail" in coda
  };
  const cab = x => smooth(st.rw, st.rw + 0.008, x) * (1 - smooth(st.ws - 0.004, st.ws + 0.004, x));
  const belt = x => 0.0222 + 0.0036 * bump(x, XF, 0.026) + 0.0042 * bump(x, XR, 0.028) + 0.0022 * smooth(-0.02, -0.05, x) - 0.0065 * smooth(0.056, L2, x);
  const W = x => 0.0291 + 0.0030 * bump(x, XF, 0.022) + 0.0034 * bump(x, XR, 0.024) - 0.0048 * smooth(0.060, L2 + 0.001, x) - 0.0022 * smooth(-0.064, -L2 - 0.001, x);
  const ys = x => { let y = YB + 0.0012; for (const [xw, r] of [[XF, RF], [XR, RR]]){ const ra = r + 0.0022; const d = x - xw; if (Math.abs(d) < ra) y = Math.max(y, r + Math.sqrt(ra * ra - d * d) * 0.97); } return y; };
  return { topC, cab, belt, W, ys };
}

// punti di controllo di mezza sezione (lato destro, z>0) con coordinata v della texture
const VT = [0, .04, .06, .08, .10, .17, .27, .31, .38, .45, .5];
function sectionPts(P, x){
  const W = P.W(x), top = P.topC(x), c = P.cab(x);
  let belt = Math.min(P.belt(x), top - 0.0006 + 0.004 * (1 - c));
  const ys = Math.min(P.ys(x), belt - 0.0012);
  const y6 = Math.min(Math.max(ys + 0.0015, lerp(ys, belt, 0.45)), belt - 0.0006);
  const y5 = Math.min(ys + 0.0009, y6 - 0.0002);
  const outTop = lerp(belt, top, 0.62);
  return [
    [0, YB], [W - 0.0125, YB], [W - 0.012, ys], [W - 0.0012, ys], [W, y5], [W, y6], [W - 0.0012, belt],
    [lerp(W - 0.0035, 0.0252, c), belt + 0.0010],
    [lerp(W * 0.72, 0.0206, c), lerp(outTop, top - 0.0026, c)],
    [lerp(W * 0.36, 0.0110, c), top - 0.00035 * (1 + c)],
    [0, top],
  ];
}
// Catmull-Rom 2D con suddivisione (dal punto 3 in poi, così i passaruota restano netti)
function refine(pts){
  const out = [], vs = [];
  for (let i = 0; i < 4; i++){ out.push(pts[i]); vs.push(VT[i]); }
  const n = pts.length, get = i => i < n ? pts[i] : [-pts[2 * (n - 1) - i][0], pts[2 * (n - 1) - i][1]];
  for (let i = 3; i < n - 1; i++){
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2), S = 3;
    for (let s = 1; s <= S; s++){
      const t = s / S, t2 = t * t, t3 = t2 * t;
      const f = k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([s === S ? p2[0] : Math.max(0, f(0)), f(1)]); vs.push(lerp(VT[i], VT[i + 1], t));
    }
  }
  return { out, vs };
}

function bodyGeometry(st){
  const P = profile(st), NX = 90, pos = [], uv = [], idx = [];
  let ring = 0;
  for (let i = 0; i <= NX; i++){
    const u = i / NX, x = -L2 + u * 2 * L2;
    const { out, vs } = refine(sectionPts(P, x));
    // chiusura morbida delle estremità: le ultime sezioni si stringono
    const endK = 1;
    const full = [];
    for (let k = 0; k < out.length; k++) full.push([out[k][0], out[k][1], vs[k]]);
    for (let k = out.length - 2; k >= 0; k--) full.push([-out[k][0], out[k][1], 1 - vs[k]]);
    ring = full.length;
    for (const [z, y, v] of full){
      const cy = 0.017;
      pos.push(x, cy + (y - cy) * endK, z * endK); uv.push(u, v);
    }
  }
  for (let i = 0; i < NX; i++) for (let k = 0; k < ring - 1; k++){
    const a = i * ring + k, b = a + ring;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const bodyCount = idx.length;
  // tappi alle estremità
  for (const [i0, sgn] of [[0, 1], [NX, -1]]){
    const ci = pos.length / 3; pos.push(i0 === 0 ? -L2 : L2, 0.017, 0); uv.push(i0 === 0 ? 0.002 : 0.998, 0.2);
    for (let k = 0; k < ring - 1; k++){ const a = i0 * ring + k; if (sgn > 0) idx.push(ci, a + 1, a); else idx.push(ci, a, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.addGroup(0, bodyCount, 0); g.addGroup(bodyCount, idx.length - bodyCount, 1);
  return { g, P };
}

/* ---------------- livrea ---------------- */
// canvas 2048 x 1024: u = lunghezza (0 coda → 1 muso), v = giro della sezione (0.5 = centro del tetto)
function drawLivery(st, L){
  const W = 2048, H = 1024;
  const U = x => (x + L2) / (2 * L2) * W;                 // coordinata x auto → pixel
  const Y = v => (1 - v) * H;                             // coordinata v → pixel
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = L.base; g.fillRect(0, 0, W, H);
    // parte bassa (minigonne e fondo) nera opaca
    g.fillStyle = '#121315'; g.fillRect(0, Y(0.10), W, H); g.fillRect(0, 0, W, Y(0.90));
    // strisce e grafiche di livrea (lato destro disegnato, lato sinistro ruotato di 180°)
    const side = (fn) => { g.save(); fn(); g.restore(); g.save(); g.translate(W, H); g.rotate(Math.PI); fn(); g.restore(); };
    side(() => {
      const y0 = Y(0.27), y1 = Y(0.10);
      // fascia diagonale
      g.fillStyle = L.acc; g.beginPath(); g.moveTo(U(0.026), y1); g.lineTo(U(0.05), y0); g.lineTo(U(0.068), y0); g.lineTo(U(0.044), y1); g.fill();
      g.fillStyle = L.acc2; g.beginPath(); g.moveTo(U(0.047), y1); g.lineTo(U(0.071), y0); g.lineTo(U(0.075), y0); g.lineTo(U(0.051), y1); g.fill();
      g.fillStyle = L.acc; g.beginPath(); g.moveTo(U(-0.072), Y(0.24)); g.lineTo(U(-0.03), Y(0.27)); g.lineTo(U(-0.072), Y(0.27)); g.fill();
      // riga sottile lungo la fiancata
      g.fillStyle = L.acc; g.fillRect(U(-0.07), Y(0.135), U(0.0) - U(-0.07), 10);
      // pannello numero sulla portiera
      const nx = U((st.ws + st.rr) / 2 + 0.002), ny = Y(0.262), nw = 150, nh = 104;
      g.fillStyle = '#ffffff'; roundRect(g, nx - nw / 2, ny, nw, nh, 16); g.fill();
      g.fillStyle = '#111'; g.font = '900 90px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(L.num), nx, ny + nh / 2 + 5);
      // sponsor inventati
      g.fillStyle = L.sponsorCol; g.font = 'italic 900 54px Arial Black, Arial, sans-serif'; g.textAlign = 'center';
      g.fillText(L.sponsor, U((XF + XR) / 2 + 0.002), Y(0.155));
      g.font = '700 26px Arial, sans-serif'; g.fillStyle = L.textCol; g.fillText(L.sponsor2, U(XR + 0.001), Y(0.285));
      g.fillText('SLOT CAR CLUB', U(XF + 0.002), Y(0.285));
      // nome pilota sul finestrino
      g.font = '700 24px Arial'; g.fillStyle = '#fff'; g.fillText(L.drvName, U(st.rr + 0.004), Y(0.325));
      // linee delle portiere
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3;
      const d0 = U(st.ws - 0.004), d1 = U(st.rr + 0.006);
      g.beginPath(); g.moveTo(d0, Y(0.28)); g.lineTo(d0 + 6, Y(0.115)); g.lineTo(d1, Y(0.115)); g.lineTo(d1 - 4, Y(0.28)); g.stroke();
      // prese d'aria dietro le ruote anteriori
      g.fillStyle = 'rgba(0,0,0,.55)'; for (let k = 0; k < 4; k++) g.fillRect(U(XF - 0.02) + k * 16, Y(0.25), 8, 50);
      // finestrino laterale
      g.fillStyle = '#0b1016';
      g.beginPath(); g.moveTo(U(st.ws - 0.006), Y(0.315)); g.lineTo(U(st.rf + 0.001), Y(0.378)); g.lineTo(U(st.rr - 0.002), Y(0.378)); g.lineTo(U(st.rw + 0.01), Y(0.315)); g.closePath(); g.fill();
      // specchietto retrovisore base
      // fari
      g.fillStyle = '#1b1d20'; roundRect(g, U(0.060), Y(0.29), U(0.0715) - U(0.060), Y(0.20) - Y(0.29), 10); g.fill();
      // luci posteriori
      g.fillStyle = '#3a0508'; g.fillRect(U(-0.0719), Y(0.33), U(-0.0695) - U(-0.0719), Y(0.18) - Y(0.33));
    });
    // cofano e tetto (fascia centrale v 0.31..0.69)
    g.fillStyle = L.acc; g.fillRect(U(-0.072), Y(0.5) - 24, W, 48);
    g.fillStyle = L.acc2; g.fillRect(U(-0.072), Y(0.5) - 34, W, 8); g.fillRect(U(-0.072), Y(0.5) + 26, W, 8);
    // parabrezza con fascia del club
    g.fillStyle = '#0b1016';
    const ws0 = U(st.rf), ws1 = U(st.ws - 0.001);
    g.beginPath(); g.moveTo(ws0, Y(0.37)); g.lineTo(ws1, Y(0.31)); g.lineTo(ws1, Y(0.69)); g.lineTo(ws0, Y(0.63)); g.closePath(); g.fill();
    g.fillStyle = '#111'; g.fillRect(ws0, Y(0.64), 40, Y(0.36) - Y(0.64));
    g.save(); g.translate(ws0 + 22, Y(0.5)); g.rotate(-Math.PI / 2); g.fillStyle = '#fff'; g.font = '900 26px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.sponsor, 0, 1); g.restore();
    // lunotto
    g.fillStyle = '#0b1016';
    const r0 = U(st.rw + 0.006), r1 = U(st.rr - 0.002);
    g.beginPath(); g.moveTo(r0, Y(0.40)); g.lineTo(r1, Y(0.365)); g.lineTo(r1, Y(0.635)); g.lineTo(r0, Y(0.60)); g.closePath(); g.fill();
    // numero sul tetto
    const rx = U((st.rf + st.rr) / 2);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(rx, Y(0.5), 60, 0, 7); g.fill();
    g.save(); g.translate(rx, Y(0.5)); g.rotate(Math.PI / 2); g.fillStyle = '#111'; g.font = '900 72px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(L.num), 0, 4); g.restore();
    // botola di emergenza sul tetto
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(rx - 150, Y(0.5) - 70, 80, 140);
    // prese d'aria sul cofano
    g.fillStyle = 'rgba(0,0,0,.6)';
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) g.fillRect(U(XF - 0.012) + k * 14, Y(0.5 + s * 0.085) - 30, 7, 60);
    // linee del cofano
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.strokeRect(U(st.ws + 0.004), Y(0.5) - 170, U(0.066) - U(st.ws + 0.004), 340);
  });
  map.anisotropy = 8;
  // luci emissive (fari e stop)
  const emissive = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const u = x => (x + L2) / (2 * L2) * w, y = v => (1 - v) * h;
    for (const [v0, v1] of [[0.205, 0.285], [0.715, 0.795]]){
      g.fillStyle = '#fff4d8'; roundRect(g, u(0.0625), y(v1), u(0.0712) - u(0.0625), y(v0) - y(v1), 3); g.fill();
      g.fillStyle = '#ff2016'; g.fillRect(u(-0.0719), y(v1 + 0.04), 3, y(v0) - y(v1 + 0.04));
    }
  });
  return { map, emissive };
}
function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------------- ruote ---------------- */
function rimTexture(col){
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256); g.translate(128, 128);
    g.fillStyle = '#1a1b1e'; g.beginPath(); g.arc(0, 0, 124, 0, 7); g.fill();          // canale scuro
    g.fillStyle = '#6b6f75'; g.beginPath(); g.arc(0, 0, 100, 0, 7); g.fill();           // disco freno
    g.fillStyle = '#c21d1d'; g.fillRect(58, -30, 30, 60);                               // pinza
    g.strokeStyle = col; g.lineCap = 'round';
    for (let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2; g.lineWidth = i % 2 ? 12 : 16; g.beginPath(); g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); g.lineTo(Math.cos(a) * 118, Math.sin(a) * 118); g.stroke(); }
    g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 118, 0, 7); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
    g.fillStyle = '#d4a019'; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();          // dado centrale
  }, { clamp: true });
}
const tyreGeo = (() => {       // gomma slick con spalla arrotondata (profilo ruotato)
  const pts = [], r = 1, w = 0.9, sh = 0.18;
  pts.push(new THREE.Vector2(0.66, -w / 2));
  for (let i = 0; i <= 6; i++){ const a = -Math.PI / 2 + i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh)); }
  for (let i = 0; i <= 6; i++){ const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh)); }
  pts.push(new THREE.Vector2(0.66, w / 2));
  const g = new THREE.LatheGeometry(pts, 36); g.rotateX(Math.PI / 2); return g;
})();

/* ---------------- auto completa ---------------- */
export function makeCar(L){
  const st = STYLES[L.style] || STYLES.front;
  const root = new THREE.Group(), model = new THREE.Group(), body = new THREE.Group();
  model.position.x = -GUIDE; root.add(model); model.add(body);
  const { g: bodyG } = bodyGeometry(st);
  const { map, emissive } = drawLivery(st, L);
  const paint = new THREE.MeshPhysicalMaterial({ map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 1.6,
    roughness: 0.34, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1 });
  const capM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(L.base), roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05 });
  const shell = new THREE.Mesh(bodyG, [paint, capM]); shell.castShadow = true; shell.receiveShadow = true; body.add(shell);

  const carbon = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.35, metalness: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.7 });
  // splitter anteriore con canard
  const spl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0012, 0.061), carbon); spl.position.set(0.068, 0.0052, 0); body.add(spl);
  for (const s of [-1, 1]){
    const cn = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0008, 0.005), carbon); cn.position.set(0.064, 0.012, s * 0.0285); cn.rotation.set(0, -s * 0.5, s * 0.25); body.add(cn);
  }
  // diffusore posteriore
  for (let k = -2; k <= 2; k++){ const f = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.0035, 0.0006), carbon); f.position.set(-0.068, 0.0068, k * 0.009); body.add(f); }
  const diffP = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.0008, 0.046), carbon); diffP.position.set(-0.068, 0.0053, 0); diffP.rotation.z = -0.25; body.add(diffP);
  // fanali posteriori a barra (emissivi)
  const tlM = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a10, emissiveIntensity: 2.2 });
  for (const s of [-1, 1]){ const t = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0028, 0.013), tlM); t.position.set(-L2 - 0.0002, st.deckH - 0.004, s * 0.019); body.add(t); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0010, 0.0010, 0.024), tlM); bar.position.set(-L2 - 0.0002, st.deckH - 0.0045, 0); body.add(bar);
  // alettone con attacchi a collo di cigno
  const foil = new THREE.Shape(); foil.moveTo(0, 0); foil.bezierCurveTo(0.004, 0.0028, 0.012, 0.0026, 0.017, 0.0006); foil.bezierCurveTo(0.012, 0.0010, 0.004, -0.0004, 0, 0);
  const wingG = new THREE.ExtrudeGeometry(foil, { depth: 0.060, bevelEnabled: false, curveSegments: 10 }); wingG.translate(-0.0085, 0, -0.030);
  const wing = new THREE.Mesh(wingG, carbon); wing.position.set(-0.064, st.deckH + 0.0125, 0); wing.rotation.z = 0.10; wing.castShadow = true; body.add(wing);
  const epShape = new THREE.Shape(); epShape.moveTo(-0.0095, -0.0045); epShape.lineTo(0.0085, -0.003); epShape.lineTo(0.0095, 0.0035); epShape.lineTo(-0.0105, 0.003); epShape.closePath();
  for (const s of [-1, 1]){
    const ep = new THREE.Mesh(new THREE.ExtrudeGeometry(epShape, { depth: 0.0007, bevelEnabled: false }), carbon); ep.position.set(-0.064, st.deckH + 0.0125, s * 0.0307 - 0.00035); body.add(ep);
    const neck = new THREE.Shape(); neck.moveTo(0, 0); neck.lineTo(0.0035, 0); neck.quadraticCurveTo(0.0045, 0.009, -0.001, 0.0145); neck.lineTo(-0.0035, 0.0145); neck.quadraticCurveTo(0.0015, 0.008, 0, 0);
    const nk = new THREE.Mesh(new THREE.ExtrudeGeometry(neck, { depth: 0.0012, bevelEnabled: false }), carbon); nk.position.set(-0.060, st.deckH - 0.001, s * 0.012 - 0.0006); body.add(nk);
  }
  // specchietti
  const mirM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(L.base), roughness: 0.35, clearcoat: 1 });
  for (const s of [-1, 1]){
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0032, 0.0035), mirM); m.position.set(st.ws - 0.004, P_belt(st) + 0.0045, s * 0.0305); body.add(m);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.003, 0.004), black); stalk.position.set(st.ws - 0.003, P_belt(st) + 0.002, s * 0.0285); body.add(stalk);
  }
  // presa d'aria sul tetto
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.0025, 0.009), carbon); scoop.position.set((st.rf + st.rr) / 2 + 0.006, st.roofH + 0.0008, 0); body.add(scoop);
  // ganci traino rossi
  const hookM = new THREE.MeshStandardMaterial({ color: 0xd1181e, roughness: 0.4 });
  for (const x of [0.0715, -0.0715]){ const h = new THREE.Mesh(new THREE.TorusGeometry(0.0022, 0.0005, 6, 12), hookM); h.position.set(x, 0.011, -0.012); h.rotation.y = Math.PI / 2; body.add(h); }
  // fondo piatto
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.001, 0.05), black); floor.position.set(0, YB + 0.0005, 0); body.add(floor);

  // ruote
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.78, metalness: 0 });
  const rimM = new THREE.MeshStandardMaterial({ map: rimTexture(L.rim || '#b8bec6'), roughness: 0.3, metalness: 0.7, transparent: false });
  const wheels = [];
  for (const [wx, r] of [[XF, RF], [XR, RR]]) for (const s of [-1, 1]){
    const w = new THREE.Group(); w.position.set(wx, r, s * TRACK);
    const tw = r * 0.95;
    const ty = new THREE.Mesh(tyreGeo, tyreM); ty.scale.set(r, r, tw); ty.castShadow = true; w.add(ty);
    const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.68, 32), rimM); face.position.z = s * tw * 0.36; if (s < 0) face.rotation.y = Math.PI; w.add(face);
    model.add(w); wheels.push({ g: w, r });
  }
  // ombra di contatto (morbida) sotto l'auto
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.10), shadowMat()); blob.rotation.x = -Math.PI / 2; blob.position.set(0, 0.0004, 0); blob.renderOrder = 1; model.add(blob);
  return { root, body, model, wheels, paint };
}
function P_belt(st){ return 0.0235; }
let _shadowMat = null;
function shadowMat(){
  if (_shadowMat) return _shadowMat;
  const t = canvasTex(256, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, h / w * 1.0); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore();
    const gr2 = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, h * 0.9); gr2.addColorStop(0, 'rgba(0,0,0,.5)'); gr2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr2; g.fillRect(0, 0, w, h);
  }, { clamp: true });
  _shadowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.85 });
  return _shadowMat;
}
