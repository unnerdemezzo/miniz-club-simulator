import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCar } from './car.js';
import { DRIVERS, FLOOR, ROOM } from './config.js';
import { canvasTex } from './util.js';
import { FONT } from './banners.js';
import { benchWorkerGeometry } from './bench-worker.js';

// Finiture PBR degli oggetti d'officina: ogni colore viene unito per finitura (plastica, gomma, alluminio
// anodizzato, acciaio...) così il metallo riflette davvero la sala e la gomma resta opaca.
const FINISH = {
  plastic: { roughness: 0.46, metalness: 0 },
  satin: { roughness: 0.68, metalness: 0 },
  gloss: { roughness: 0.16, metalness: 0 },
  rubber: { roughness: 0.93, metalness: 0 },
  anodized: { roughness: 0.34, metalness: 0.82 },
  steel: { roughness: 0.22, metalness: 1 },
  chrome: { roughness: 0.07, metalness: 1 }
};
const swatches = new Map(),
  finishOf = new Map();
const mat = (colour, finish = 'plastic') => {
  const key = `${finish}:${colour}`;
  if (!swatches.has(key)) {
    const m = new T.MeshStandardMaterial({ color: colour, ...FINISH[finish] });
    swatches.set(key, m);
    finishOf.set(m, finish);
  }
  return swatches.get(key);
};
const paint = (colour) => mat(colour, 'plastic');
const palettes = Object.fromEntries(
  Object.entries(FINISH).map(([k, f]) => [k, new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, ...f })])
);
const paletteSet = new Set(Object.values(palettes));
const led = new T.MeshBasicMaterial({ color: 0xfff4dc });

// Stampe, display e serigrafie: una texture per tipo, condivisa da tutti i banchi
const decals = new Map();
function decal(key, w, h, draw, { glow = 0, roughness = 0.42, transparent = false } = {}) {
  if (!decals.has(key)) {
    const map = canvasTex(w, h, draw, { clamp: true });
    decals.set(
      key,
      new T.MeshStandardMaterial({
        map,
        roughness,
        transparent,
        ...(glow ? { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: glow } : {})
      })
    );
  }
  return decals.get(key);
}

function primitives(root) {
  const part = (g, m, x, y, z, name, rotation = [0, 0, 0]) => {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.rotation.set(...rotation);
    o.name = name;
    o.castShadow = o.receiveShadow = true;
    root.add(o);
    return o;
  };
  return {
    part,
    box: (w, h, d, m, x, y, z, n, rot = [0, 0, 0]) => part(new T.BoxGeometry(w, h, d), m, x, y, z, n, rot),
    rbox: (w, h, d, m, x, y, z, n, r = 0.002, rot = [0, 0, 0]) =>
      part(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), m, x, y, z, n, rot),
    cylinder: (r, h, m, x, y, z, n, rot = [0, 0, 0], seg = 24) =>
      part(new T.CylinderGeometry(r, r, h, seg), m, x, y, z, n, rot),
    // Profilo tornito [raggio, altezza] attorno all'asse Y
    lathe: (profile, m, x, y, z, n, rot = [0, 0, 0], seg = 28) =>
      part(new T.LatheGeometry(profile.map(([r, h]) => new T.Vector2(r, h)), seg), m, x, y, z, n, rot),
    plane: (w, h, m, x, y, z, n, rot = [0, 0, 0]) => {
      const o = part(new T.PlaneGeometry(w, h), m, x, y, z, n, rot);
      o.castShadow = false;
      return o;
    },
    rod: (a, b, r, m, n, seg = 12) => {
      const A = new T.Vector3(...a),
        B = new T.Vector3(...b),
        o = part(
          new T.CylinderGeometry(r, r, A.distanceTo(B), seg),
          m,
          ...A.clone().add(B).multiplyScalar(0.5).toArray(),
          n
        );
      o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.sub(A).normalize());
      return o;
    },
    tube: (points, r, m, n, seg = 24, radial = 8) =>
      part(
        new T.TubeGeometry(new T.CatmullRomCurve3(points.map((v) => new T.Vector3(...v))), seg, r, radial, false),
        m,
        0,
        0,
        0,
        n
      )
  };
}

// Sagoma laterale [z, y] con spigoli raccordati, estrusa lungo X (larghezza `width`)
function profileSolid(points, width, corner = 0.004, bevel = 0.0015) {
  const s = new T.Shape(),
    v = points.map(([z, y]) => new T.Vector2(-z, y));
  v.forEach((p, i) => {
    const prev = v[(i + v.length - 1) % v.length],
      next = v[(i + 1) % v.length];
    const a = p.clone().lerp(prev, Math.min(0.45, corner / p.distanceTo(prev))),
      b = p.clone().lerp(next, Math.min(0.45, corner / p.distanceTo(next)));
    s[i ? 'lineTo' : 'moveTo'](a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  s.closePath();
  const g = new T.ExtrudeGeometry(s, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 6
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// Unisce tutte le geometrie statiche del banco per materiale (zero perdita di FPS anche con tantissimi dettagli!)
function batch(root, exclude) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(),
    groups = new Map(),
    meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || exclude?.includes(o) || o.userData.unbatched) return;
    meshes.push(o);
    const material = finishOf.has(o.material) ? palettes[finishOf.get(o.material)] : o.material;
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push(o);
  });
  root.userData.inventory = meshes.map((o) => o.name);
  for (const [material, items] of groups) {
    const painted = paletteSet.has(material);
    const parts = items.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      if (painted) {
        g.deleteAttribute('uv');
        if (!g.attributes.color) {
          const c = o.material.color,
            values = new Float32Array(g.attributes.position.count * 3);
          for (let i = 0; i < values.length; i += 3) {
            values[i] = c.r;
            values[i + 1] = c.g;
            values[i + 2] = c.b;
          }
          g.setAttribute('color', new T.BufferAttribute(values, 3));
        }
      } else if (!g.attributes.uv) {
        g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      for (const k of Object.keys(g.attributes)) {
        if (!['position', 'normal', painted ? 'color' : 'uv'].includes(k)) g.deleteAttribute(k);
      }
      g.clearGroups();
      return g;
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Dettagli officina raggruppati';
    mesh.castShadow = !material.isMeshBasicMaterial && !material.transparent;
    mesh.receiveShadow = !material.isMeshBasicMaterial;
    root.add(mesh);
  }
  for (const o of meshes) {
    const anchor = new T.Group();
    anchor.name = o.name;
    anchor.position.copy(o.position);
    anchor.quaternion.copy(o.quaternion);
    anchor.scale.copy(o.scale);
    Object.assign(anchor.userData, o.userData);
    o.parent.add(anchor);
    o.removeFromParent();
  }
}

function label(root, text, w, h, x, y, z, angle = 0, bg = '#101824', fg = '#38bdf8', flat = false) {
  const map = canvasTex(
    256,
    64,
    (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 3;
      g.strokeRect(2, 2, W - 4, H - 4);
      g.fillStyle = fg;
      g.font = 'bold 26px Consolas, Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, W / 2, H / 2, W - 14);
    },
    { clamp: true }
  );
  const o = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map, roughness: 0.45 }));
  o.position.set(x, y, z);
  if (flat) {
    o.rotation.set(-Math.PI / 2, 0, angle);
  } else {
    o.rotation.y = angle;
  }
  o.name = text;
  o.userData.unbatched = true;
  root.add(o);
  return o;
}

// Display a segmenti / LCD retroilluminato disegnato su canvas
function lcdDraw(lines, { bg = '#0b1a12', fg = '#9ff5b8', size = 0.34, mono = true } = {}) {
  return (g, w, h) => {
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, w, h);
    const pad = h * 0.08,
      gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, bg);
    gr.addColorStop(1, '#000000');
    g.fillStyle = gr;
    g.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    lines.forEach((t, i) => {
      g.font = `700 ${Math.round(h * size)}px ${mono ? 'Consolas, "Courier New", monospace' : FONT}`;
      g.fillText(t, pad * 2, pad + ((i + 0.5) * (h - pad * 2)) / lines.length, w - pad * 4);
    });
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(pad, pad, w - pad * 2, (h - pad * 2) * 0.35);
  };
}

// Ruota di ricambio Kyosho Mini-Z: gomma slick con spalla arrotondata, canale del cerchio con flangia,
// fondo scuro, 5 razze, mozzo esagonale e dado M2 colorato
function addSpareMiniZWheel(part, rubberMat, rimMat, nutMat, x, y, z, isRear = false, standing = false, rotY = 0) {
  const width = isRear ? 0.0135 : 0.0105;
  const R = 0.0125;
  const rimR = 0.0084;
  const hw = width / 2;
  const sh = 0.0022;

  const tirePts = [[rimR - 0.0003, -hw * 0.94]];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    tirePts.push([R - sh + Math.sin(a) * sh, -hw + sh - Math.cos(a) * sh]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    tirePts.push([R - sh + Math.cos(a) * sh, hw - sh + Math.sin(a) * sh]);
  }
  tirePts.push([rimR - 0.0003, hw * 0.94]);
  const rimPts = [
    [rimR * 0.9, -hw * 0.9],
    [rimR + 0.0004, -hw * 0.98],
    [rimR, -hw * 0.82],
    [rimR, hw * 0.82],
    [rimR + 0.0004, hw * 0.98],
    [rimR * 0.92, hw * 0.98],
    [rimR * 0.86, hw * 0.5]
  ];

  const rot = standing ? [0, rotY, Math.PI / 2] : [0, rotY, 0];
  const wy = standing ? y + R : y + hw;
  const o = new T.Object3D();
  o.rotation.set(...rot);
  o.updateMatrix();
  const at = (g, dy) => {
    g.translate(0, dy, 0);
    g.applyMatrix4(o.matrix);
    return g;
  };

  part(at(new T.LatheGeometry(tirePts.map(([r, h]) => new T.Vector2(r, h)), 40), 0), rubberMat, x, wy, z, 'Pneumatico slick di ricambio Mini-Z');
  part(at(new T.LatheGeometry(rimPts.map(([r, h]) => new T.Vector2(r, h)), 32), 0), rimMat, x, wy, z, 'Cerchio racing Mini-Z');
  part(at(new T.CylinderGeometry(rimR * 0.88, rimR * 0.88, 0.0006, 28), -hw * 0.1), mat(0x1a1c20, 'satin'), x, wy, z, 'Fondo cerchio');
  for (let s = 0; s < 5; s++) {
    const g = new T.BoxGeometry(rimR * 0.82, 0.0012, 0.0016);
    g.translate(rimR * 0.45, 0, 0);
    g.rotateY((s / 5) * Math.PI * 2);
    part(at(g, hw * 0.42), rimMat, x, wy, z, 'Razza cerchio ricambio');
  }
  part(at(new T.CylinderGeometry(0.0026, 0.003, width * 0.7, 6), hw * 0.2), rimMat, x, wy, z, 'Mozzo esagonale cerchio');
  part(at(new T.CylinderGeometry(0.0021, 0.0021, 0.0022, 6), hw * 0.62), nutMat, x, wy, z, 'Dado ruota M2 anodizzato');
}

// Radiocomando pistola 2.4 GHz da Mini-Z (impostazione tipo Kyosho KT-531P / Sanwa MT): impugnatura gommata,
// volantino con anello in spugna, grilletto, display retroilluminato, trim e antenna corta
function addTransmitter(root, x, y, z, rotY) {
  const g = new T.Group();
  g.name = 'Radiocomando pistola Mini-Z 2.4GHz';
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  root.add(g);
  const { part, rbox, cylinder, lathe, plane, rod } = primitives(g);
  const shell = mat(0x26292e, 'satin'),
    rubber = mat(0x141517, 'rubber'),
    gloss = mat(0x0d0e10, 'gloss'),
    alu = mat(0xb9c0c8, 'anodized'),
    accent = mat(0xd61f26, 'gloss');

  const body = [
    [0.046, 0.016], [0.041, 0.052], [0.045, 0.09], [0.054, 0.122], [0.05, 0.152], [0.034, 0.168],
    [-0.04, 0.173], [-0.086, 0.166], [-0.103, 0.149], [-0.098, 0.128], [-0.052, 0.121], [-0.022, 0.118],
    [-0.009, 0.104], [-0.004, 0.062], [-0.009, 0.03], [-0.006, 0.016]
  ];
  part(profileSolid(body, 0.032, 0.007), shell, 0, 0, 0, 'Scocca radiocomando');
  const grip = [[0.043, 0.02], [0.039, 0.052], [0.043, 0.088], [0.046, 0.1], [-0.006, 0.1], [-0.002, 0.062], [-0.006, 0.026], [-0.004, 0.02]];
  part(profileSolid(grip, 0.0352, 0.006, 0.002), rubber, 0, 0, 0, 'Impugnatura gommata');
  for (let i = 0; i < 7; i++) {
    rbox(0.0358, 0.0016, 0.03, rubber, 0, 0.03 + i * 0.0095, 0.021, 'Rigatura impugnatura', 0.0006);
  }
  // Base portabatterie 4×AA con sportellino
  rbox(0.042, 0.016, 0.074, shell, 0, 0.008, 0.02, 'Vano batterie radiocomando', 0.004);
  rbox(0.043, 0.0012, 0.05, mat(0x1b1d21, 'satin'), 0, 0.0115, 0.02, 'Fuga sportello batterie', 0.0004);

  // Grilletto gas/freno
  const trigger = [[-0.011, 0.113], [-0.026, 0.11], [-0.034, 0.1], [-0.033, 0.086], [-0.025, 0.08], [-0.018, 0.088], [-0.012, 0.099]];
  part(profileSolid(trigger, 0.011, 0.003, 0.001), gloss, 0, 0, 0, 'Grilletto gas freno');

  // Volantino sul lato destro: supporto, disco, anello in spugna e tappo in alluminio
  const wy = 0.137,
    wz = -0.062;
  cylinder(0.011, 0.012, shell, 0.021, wy, wz, 'Supporto volantino', [0, 0, Math.PI / 2], 24);
  cylinder(0.0255, 0.008, gloss, 0.031, wy, wz, 'Disco volantino', [0, 0, Math.PI / 2], 40);
  part(new T.TorusGeometry(0.0265, 0.0058, 14, 48), rubber, 0.031, wy, wz, 'Anello spugna volantino', [0, Math.PI / 2, 0]);
  lathe([[0, 0.0055], [0.008, 0.0055], [0.0095, 0.004], [0.0095, 0]], alu, 0.035, wy, wz, 'Tappo alluminio volantino', [0, 0, -Math.PI / 2], 32);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rbox(0.003, 0.016, 0.004, shell, 0.0365, wy + Math.cos(a) * 0.016, wz + Math.sin(a) * 0.016, 'Razza volantino', 0.001, [a, 0, 0]);
  }

  // Display retroilluminato, tasti e trim sul cupolino
  rbox(0.026, 0.004, 0.05, gloss, 0, 0.174, -0.004, 'Cornice display radiocomando', 0.0015);
  plane(
    0.021,
    0.04,
    decal('tx-lcd', 256, 128, lcdDraw(['M01 MR-04', 'ST 100% TH 95%', 'BAT 5.2V  ▮▮▮▮'], { bg: '#18364a', fg: '#d9f2ff', size: 0.24 }), { glow: 0.55 }),
    0,
    0.1765,
    -0.004,
    'Display radiocomando',
    [-Math.PI / 2, 0, Math.PI / 2]
  );
  for (let i = 0; i < 3; i++) {
    rbox(0.006, 0.0025, 0.004, i === 1 ? accent : gloss, -0.009 + i * 0.009, 0.1735, 0.027, 'Tasto menu radiocomando', 0.0008);
  }
  for (const [tz, ty] of [[-0.06, 0.168], [-0.08, 0.162]]) {
    rbox(0.012, 0.004, 0.006, gloss, 0, ty + 0.002, tz, 'Trim digitale', 0.0015);
  }
  // Interruttore e serigrafie laterali
  rbox(0.004, 0.008, 0.006, accent, -0.0165, 0.14, 0.03, 'Interruttore accensione', 0.001);
  const side = decal('tx-side', 256, 96, (c, w, h) => {
    c.fillStyle = '#26292e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2f4f7';
    c.font = `italic 900 46px ${FONT}`;
    c.fillText('MZ-4', 12, 50);
    c.fillStyle = '#d61f26';
    c.fillRect(140, 22, 104, 6);
    c.fillStyle = '#9aa3ad';
    c.font = `700 22px ${FONT}`;
    c.fillText('2.4GHz FHSS · MINI-Z', 12, 82, w - 24);
  });
  plane(0.034, 0.0128, side, 0.01615, 0.148, 0.005, 'Serigrafia radiocomando', [0, Math.PI / 2, 0]);
  plane(0.034, 0.0128, side, -0.01615, 0.148, -0.03, 'Serigrafia radiocomando', [0, -Math.PI / 2, 0]);
  // Antenna corta in gomma
  rod([0, 0.168, 0.026], [0, 0.205, 0.04], 0.0035, rubber, 'Antenna radiocomando');
  part(new T.SphereGeometry(0.0035, 12, 8), rubber, 0, 0.205, 0.04, 'Puntale antenna');
  cylinder(0.0055, 0.006, shell, 0, 0.17, 0.025, 'Base antenna', [0.36, 0, 0]);
}

// Calibro digitale inox (aperto a 12.45 mm) appoggiato piatto sul banco
function addCaliper(root, x, y, z, rotY) {
  const g = new T.Group();
  g.name = 'Calibro digitale inox';
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  root.add(g);
  const { box, rbox, plane, cylinder } = primitives(g);
  const steel = mat(0xd5dae0, 'steel');
  box(0.155, 0.0026, 0.016, steel, 0, 0.0013, 0, 'Asta calibro');
  box(0.0085, 0.0026, 0.042, steel, -0.0735, 0.0013, -0.022, 'Becco fisso calibro');
  box(0.008, 0.0026, 0.018, steel, -0.0735, 0.0013, 0.015, 'Becco interno fisso');
  box(0.0085, 0.0026, 0.04, steel, -0.0605, 0.0039, -0.021, 'Becco mobile calibro');
  rbox(0.056, 0.0075, 0.03, mat(0x1d2025, 'plastic'), -0.03, 0.0052, 0.004, 'Corsoio display calibro', 0.002);
  plane(
    0.03,
    0.012,
    decal('caliper', 192, 80, lcdDraw(['12.45'], { bg: '#a6ad9b', fg: '#16180f', size: 0.62 })),
    -0.034,
    0.0091,
    0.004,
    'Display calibro 12.45 mm',
    [-Math.PI / 2, 0, 0]
  );
  for (let i = 0; i < 3; i++) {
    cylinder(0.0022, 0.0015, mat(0xe2e5e8, 'plastic'), -0.008 + (i % 2) * 0.006, 0.0091, -0.006 + i * 0.006, 'Tasto calibro');
  }
  cylinder(0.003, 0.004, steel, -0.022, 0.006, -0.011, 'Rotella calibro', [Math.PI / 2, 0, 0], 16);
  for (let i = 0; i <= 12; i++) {
    box(0.0004, 0.0002, i % 5 === 0 ? 0.005 : 0.003, mat(0x1d2025, 'satin'), 0 + i * 0.005, 0.0027, -0.0055, 'Tacca scala calibro');
  }
}

export function buildBenchEquipment(scene, M, { x, y, z, room, car = true, stand = false, rotation = 0, worker = null }) {
  const root = new T.Group();
  root.name = `Attrezzatura banco ${room}`;
  root.position.set(x, y, z);
  scene.add(root);

  const { part, box, rbox, cylinder, lathe, plane, rod, tube } = primitives(root);
  const kyoshoRed = mat(0xc4161c, 'anodized');
  const anodBlue = mat(0x1f4fbf, 'anodized');
  const anodGold = mat(0xd38a1a, 'anodized');
  const anodTitan = mat(0x4a5361, 'anodized');
  const silverAlu = mat(0xc9ced4, 'anodized');
  const steel = mat(0xc6ccd2, 'steel');
  const chrome = mat(0xe7ebef, 'chrome');
  const brass = mat(0xc9a14a, 'steel');
  const blackPlastic = mat(0x16171a, 'plastic');
  const satinBlack = mat(0x1d1f23, 'satin');
  const greyPlastic = mat(0x5b626b, 'plastic');
  const rubberMat = mat(0x1a1b1d, 'rubber');
  const floor = (px, pz) => (px > -0.21 && px < 0.31 && pz > -0.41 && pz < 0.31 ? 0.005 : -0.002);

  // 1. Tappetino da pit in gomma con griglia centimetrata e righello (copre il vecchio tappetino stampato)
  part(
    new RoundedBoxGeometry(0.52, 0.005, 0.72, 2, 0.002),
    decal('pitmat', 512, 712, (g, w, h) => {
      g.fillStyle = '#23262b';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      const cm = w / 52;
      for (let i = 1; i < 52; i++) {
        g.fillStyle = i % 5 ? 'rgba(160,170,182,0.16)' : 'rgba(180,190,200,0.32)';
        g.fillRect(i * cm, 0, 1, h);
      }
      for (let j = 1; j < 72; j++) {
        g.fillStyle = j % 5 ? 'rgba(160,170,182,0.16)' : 'rgba(180,190,200,0.32)';
        g.fillRect(0, j * cm, w, 1);
      }
      g.fillStyle = '#e2e6ea';
      for (let i = 0; i <= 50; i++) g.fillRect(cm + i * cm, h - cm * 2.4, 1.6, i % 5 ? cm * 0.5 : cm * 0.9);
      g.font = `700 ${Math.round(cm * 0.7)}px ${FONT}`;
      for (let i = 0; i <= 50; i += 10) g.fillText(String(i), cm + i * cm + 3, h - cm * 0.9);
      g.save();
      g.translate(w - cm * 1.6, h * 0.5);
      g.rotate(-Math.PI / 2);
      g.font = `italic 900 ${Math.round(cm * 1.6)}px ${FONT}`;
      g.fillStyle = 'rgba(214,31,38,0.85)';
      g.textAlign = 'center';
      g.fillText('MINI-Z PIT MAT', 0, 0);
      g.restore();
    }, { roughness: 0.9 }),
    0.05,
    0.0025,
    -0.05,
    'Tappetino pit in gomma Mini-Z'
  );

  if (stand) {
    // Cavalletto girevole da setup in alluminio anodizzato: la gomma superiore arriva a y = 0.0316 m così il fondo
    // piatto del telaio MR-04 (y_min = 0.0034 m con auto a y = +0.0282 m) appoggia sul supporto con le ruote sollevate di 9 mm.
    lathe([[0, 0.005], [0.046, 0.005], [0.05, 0.0075], [0.05, 0.0095], [0.047, 0.011], [0, 0.011]], anodTitan, 0, 0, -0.02, 'Base girevole cavalletto setup', [0, 0, 0], 48);
    cylinder(0.012, 0.011, steel, 0, 0.0155, -0.02, 'Perno girevole cavalletto', [0, 0, 0], 28);
    rbox(0.05, 0.0045, 0.074, anodBlue, 0, 0.0232, -0.02, 'Piastra centrale cavalletto', 0.0015);
    for (const sx of [-0.019, 0.019]) {
      for (const sz of [-0.03, 0.03]) {
        lathe([[0.0042, 0], [0.0042, 0.003], [0.0033, 0.0035], [0.0033, 0.0045], [0.0042, 0.005]], anodBlue, sx, 0.0254, -0.02 + sz, 'Colonnina cavalletto anodizzata', [0, 0, 0], 20);
      }
    }
    rbox(0.058, 0.0032, 0.092, anodTitan, 0, 0.0284, -0.02, 'Piastra superiore cavalletto setup', 0.0012);
    for (const sx of [-0.024, 0.024]) {
      for (const sz of [-0.04, 0.04]) cylinder(0.0016, 0.0006, chrome, sx, 0.0303, -0.02 + sz, 'Vite svasata piastra', [0, 0, 0], 12);
    }
    rbox(0.014, 0.0018, 0.086, rubberMat, -0.017, 0.0308, -0.02, 'Pad antiscivolo sinistro cavalletto', 0.0006);
    rbox(0.014, 0.0018, 0.086, rubberMat, 0.017, 0.0308, -0.02, 'Pad antiscivolo destro cavalletto', 0.0006);
  }

  const excluded = [];
  if (car) {
    const model = makeCar({ ...DRIVERS[1], base: '#256ca3', num: 12 });
    model.root.name = 'Auto RC sul banco secondario';
    model.root.position.set(-0.02, 0.006, 0);
    model.root.rotation.y = Math.PI / 2;
    root.add(model.root);
    model.root.traverse((o) => {
      if (o.isMesh) excluded.push(o);
    });
  }

  // 2. Radiocomando pistola in piedi sulla sua base, volantino verso chi lavora al banco
  addTransmitter(root, 0.02, floor(0.02, -0.33), -0.33, -0.55);

  // 3. Caricabatterie 4×AAA Ni-MH con quattro pile ministilo nei vani e display di carica
  {
    const cx = -0.3,
      cz = -0.2,
      cy = floor(cx, cz);
    rbox(0.078, 0.024, 0.118, mat(0x2a2e34, 'satin'), cx, cy + 0.012, cz, 'Caricabatterie digitale 4xAAA Ni-MH', 0.006);
    rbox(0.07, 0.003, 0.098, blackPlastic, cx, cy + 0.0235, cz - 0.004, 'Coperchio vani caricabatterie', 0.0012);
    for (let c = 0; c < 4; c++) {
      const bx = cx - 0.0255 + c * 0.017;
      rbox(0.0118, 0.004, 0.056, satinBlack, bx, cy + 0.0245, cz - 0.006, 'Vano cella AAA caricabatterie', 0.001);
      cylinder(0.0052, 0.0445, mat(0x0b6fb3, 'gloss'), bx, cy + 0.0262, cz - 0.006, 'Batteria AAA Ni-MH in carica', [Math.PI / 2, 0, 0], 24);
      cylinder(0.00525, 0.005, mat(0xf2f4f6, 'gloss'), bx, cy + 0.0262, cz - 0.016, 'Fascia etichetta AAA', [Math.PI / 2, 0, 0], 24);
      cylinder(0.0018, 0.0016, steel, bx, cy + 0.0262, cz + 0.0172, 'Polo positivo AAA', [Math.PI / 2, 0, 0], 12);
      box(0.006, 0.006, 0.0012, steel, bx, cy + 0.0262, cz + 0.0195, 'Contatto molla caricatore');
      cylinder(0.0012, 0.0014, mat(c < 3 ? 0x22c55e : 0xf59e0b, 'gloss'), bx, cy + 0.0247, cz + 0.035, 'LED stato cella');
    }
    plane(
      0.06,
      0.016,
      decal('charger', 256, 72, lcdDraw(['1.42V 800mAh  FULL'], { bg: '#10261a', fg: '#7bf29a', size: 0.42 }), { glow: 0.6 }),
      cx + 0.0392,
      cy + 0.012,
      cz,
      'Display caricabatterie',
      [0, Math.PI / 2, 0]
    );
    rod([cx - 0.02, cy + 0.006, cz - 0.059], [cx - 0.04, cy + 0.003, cz - 0.16], 0.0018, satinBlack, 'Cavo alimentazione caricabatterie');
  }

  // 4. Portaattrezzi in alluminio con cacciaviti esagonali 1.5 / 2.0 / 2.5 mm e chiave a tubo 5.5 mm
  {
    const sx = -0.3,
      sz = 0.1,
      sy = floor(sx, sz);
    rbox(0.034, 0.024, 0.13, anodTitan, sx, sy + 0.012, sz, 'Portaattrezzi alluminio', 0.003);
    const ringCols = [kyoshoRed, anodBlue, anodGold, mat(0x16a34a, 'anodized'), silverAlu];
    for (let i = 0; i < 5; i++) {
      const dz = sz - 0.05 + i * 0.025,
        top = sy + 0.03;
      cylinder(0.0014, 0.032, steel, sx, sy + 0.014 + 0.016, dz, 'Stelo cacciavite esagonale', [0, 0, 0], 12);
      lathe(
        [[0, 0], [0.0035, 0], [0.0052, 0.004], [0.0062, 0.011], [0.0062, 0.058], [0.0058, 0.064], [0.0045, 0.068], [0, 0.068]],
        silverAlu,
        sx,
        top,
        dz,
        'Impugnatura cacciavite alluminio',
        [0, 0, 0],
        24
      );
      for (let k = 0; k < 6; k++) {
        cylinder(0.0063, 0.0012, satinBlack, sx, top + 0.018 + k * 0.006, dz, 'Zigrinatura impugnatura', [0, 0, 0], 24);
      }
      cylinder(0.0064, 0.006, ringCols[i], sx, top + 0.054, dz, 'Fascia colore misura cacciavite', [0, 0, 0], 24);
      cylinder(0.0046, 0.0035, chrome, sx, top + 0.0695, dz, 'Tappo girevole cacciavite', [0, 0, 0], 24);
    }
    // Un cacciavite in uso, appoggiato sul tappetino vicino al telaio
    const lx = 0.0,
      lz = 0.2,
      ly = floor(lx, lz) + 0.0062;
    lathe(
      [[0, 0], [0.0035, 0], [0.0052, 0.004], [0.0062, 0.011], [0.0062, 0.058], [0.0058, 0.064], [0.0045, 0.068], [0, 0.068]],
      silverAlu,
      lx,
      ly,
      lz,
      'Cacciavite esagonale 1.5 mm in uso',
      [0, 0, -Math.PI / 2 + 0.002],
      24
    );
    cylinder(0.0064, 0.006, kyoshoRed, lx + 0.054, ly, lz, 'Fascia rossa 1.5 mm', [0, 0, Math.PI / 2], 24);
    for (let k = 0; k < 6; k++) cylinder(0.0063, 0.0012, satinBlack, lx + 0.018 + k * 0.006, ly, lz, 'Zigrinatura impugnatura', [0, 0, Math.PI / 2], 24);
    cylinder(0.0009, 0.05, steel, lx - 0.025, ly - 0.0035, lz, 'Stelo esagonale 1.5 mm', [0, 0, Math.PI / 2], 6);
  }

  // 5. Ruote di ricambio: set completo davanti/dietro appoggiato sul tappetino + portaruote con 4 cerchi montati
  const flatWheels = [
    [0.21, 0.12, false, anodBlue],
    [0.238, 0.12, false, anodBlue],
    [0.21, 0.155, true, kyoshoRed],
    [0.238, 0.155, true, kyoshoRed]
  ];
  for (const [wx, wz, isRear, nutCol] of flatWheels) {
    addSpareMiniZWheel(part, rubberMat, silverAlu, nutCol, wx, 0.005, wz, isRear, false, 0);
  }
  {
    const rx = -0.12,
      rz = 0.5,
      ry = floor(rx, rz);
    rbox(0.13, 0.004, 0.045, anodTitan, rx, ry + 0.002, rz, 'Base portaruote Mini-Z', 0.0015);
    for (const ex of [-0.062, 0.062]) rbox(0.004, 0.034, 0.03, anodTitan, rx + ex, ry + 0.019, rz, 'Fianco portaruote', 0.0012);
    rod([rx - 0.062, ry + 0.0255, rz], [rx + 0.062, ry + 0.0255, rz], 0.0021, steel, 'Asta portaruote Mini-Z');
    for (let i = 0; i < 4; i++) {
      addSpareMiniZWheel(part, rubberMat, i < 2 ? silverAlu : mat(0x202328, 'anodized'), i < 2 ? anodBlue : kyoshoRed, rx - 0.04 + i * 0.026, ry + 0.013, rz, i >= 2, true, Math.PI / 2);
    }
  }

  // 6. Chiave a croce per dadi ruota M2 e chiave a tubo 5.5 mm
  {
    const kx = 0.27,
      kz = 0.215,
      ky = floor(kx, kz);
    for (const a of [0.35, 0.35 + Math.PI / 2]) {
      rbox(0.07, 0.004, 0.007, steel, kx, ky + 0.002, kz, 'Braccio chiave a croce', 0.0015, [0, a, 0]);
    }
    for (let i = 0; i < 4; i++) {
      const a = 0.35 + (i * Math.PI) / 2;
      cylinder(0.0042, 0.006, steel, kx + Math.cos(a) * 0.035, ky + 0.003, kz - Math.sin(a) * 0.035, 'Bussola chiave a croce', [0, 0, 0], 6);
    }
  }

  // 7. Vassoio magnetico con viti M2, dadi ruota, pignoni in ottone e due motori di ricambio
  {
    const tx = 0.17,
      tz = 0.25,
      ty = floor(tx, tz);
    lathe([[0, 0], [0.036, 0], [0.04, 0.003], [0.042, 0.011], [0.039, 0.012], [0.037, 0.004], [0, 0.004]], chrome, tx - 0.07, ty, tz - 0.06, 'Vassoio magnetico inox', [0, 0, 0], 40);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4,
        r = 0.006 + (i % 5) * 0.0055,
        px = tx - 0.07 + Math.cos(a) * r,
        pz = tz - 0.06 + Math.sin(a) * r;
      if (i % 3 === 0) {
        cylinder(0.0024, 0.0035, brass, px, ty + 0.0062, pz, 'Pignone ottone 8T', [0, 0, 0], 8);
      } else if (i % 3 === 1) {
        cylinder(0.0021, 0.002, i % 2 ? anodBlue : kyoshoRed, px, ty + 0.0052, pz, 'Dado ruota M2', [0, 0, 0], 6);
      } else {
        cylinder(0.0018, 0.0012, steel, px, ty + 0.0047, pz, 'Testa vite M2', [0, 0, 0], 12);
        cylinder(0.0008, 0.006, steel, px, ty + 0.0047, pz + 0.003, 'Gambo vite M2', [Math.PI / 2, 0, 0], 8);
      }
    }
    for (let m = 0; m < 2; m++) {
      const mx = tx + 0.005 + m * 0.02,
        mz = tz - 0.03;
      cylinder(0.0078, 0.02, chrome, mx, ty + 0.0078, mz, 'Motore Mini-Z di ricambio', [Math.PI / 2, 0, 0], 28);
      cylinder(0.0078, 0.006, mat(m ? 0x1f2937 : 0x7c1d1d, 'plastic'), mx, ty + 0.0078, mz + 0.013, 'Calotta motore', [Math.PI / 2, 0, 0], 28);
      cylinder(0.0006, 0.008, steel, mx, ty + 0.0078, mz - 0.014, 'Albero motore', [Math.PI / 2, 0, 0], 8);
      cylinder(0.0022, 0.003, brass, mx, ty + 0.0078, mz - 0.0165, 'Pignone motore', [Math.PI / 2, 0, 0], 9);
      for (const s of [-1, 1]) box(0.002, 0.0006, 0.004, brass, mx + s * 0.003, ty + 0.0078, mz + 0.018, 'Linguetta saldatura motore');
    }
  }

  // 8. Olio siliconico ammortizzatori, grasso per differenziale e calibro altezza da terra
  {
    const oils = [
      ['#1d4ed8', 'SILICONE OIL', '#300'],
      ['#c4161c', 'SILICONE OIL', '#500'],
      ['#111827', 'DIFF GREASE', 'BALL DIFF']
    ];
    oils.forEach(([col, a, b], i) => {
      const bx = -0.33 + i * 0.03,
        bz = 0.3,
        by = floor(bx, bz);
      lathe(
        [[0, 0], [0.0105, 0], [0.0115, 0.002], [0.0115, 0.036], [0.0095, 0.041], [0.0045, 0.043], [0.0045, 0.047], [0, 0.047]],
        mat(0xf1f3f4, 'gloss'),
        bx,
        by,
        bz,
        'Flacone olio siliconico',
        [0, 0, 0],
        28
      );
      part(
        new T.CylinderGeometry(0.0117, 0.0117, 0.024, 28, 1, true),
        decal(`oil-${i}`, 256, 96, (g, w, h) => {
          g.fillStyle = '#f7f7f5';
          g.fillRect(0, 0, w, h);
          g.fillStyle = col;
          g.fillRect(0, 0, w, h * 0.34);
          g.fillStyle = '#fff';
          g.font = `800 26px ${FONT}`;
          g.fillText(a, 10, 26);
          g.fillStyle = '#16181c';
          g.font = `900 40px ${FONT}`;
          g.fillText(b, 10, 76);
          g.fillStyle = col;
          g.fillText(b, 138, 76);
        }),
        bx,
        by + 0.019,
        bz,
        'Etichetta flacone',
        [0, -1.2, 0]
      );
      lathe([[0, 0], [0.006, 0], [0.006, 0.006], [0.0035, 0.008], [0.0012, 0.019], [0, 0.019]], mat(col === '#111827' ? 0x111827 : col === '#1d4ed8' ? 0x1d4ed8 : 0xc4161c, 'plastic'), bx, by + 0.044, bz, 'Tappo dosatore flacone', [0, 0, 0], 20);
    });
    // Calibro altezza telaio a gradini in alluminio
    const gx = -0.14,
      gz = 0.25,
      gy = floor(gx, gz);
    for (let s = 0; s < 5; s++) {
      box(0.012, 0.002 + s * 0.0005, 0.03, kyoshoRed, gx + s * 0.012, gy + (0.002 + s * 0.0005) / 2, gz, 'Gradino calibro altezza Mini-Z');
    }
    plane(
      0.058,
      0.009,
      decal('rideheight', 256, 40, (g, w, h) => {
        g.fillStyle = '#a3141a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.font = `700 22px ${FONT}`;
        ['2.0', '2.5', '3.0', '3.5', '4.0'].forEach((t, i) => g.fillText(t, 8 + i * 51, 28));
      }),
      gx + 0.024,
      gy + 0.0045,
      gz + 0.0152,
      'Scala calibro altezza'
    );
  }

  // 9. Calibro digitale appoggiato vicino al cavalletto
  addCaliper(root, 0.235, 0.005, 0.0, -1.25);

  // 10. Stazione saldante digitale con supporto a spirale, spugnetta e lana d'ottone
  {
    const px = -0.18,
      pz = -0.56,
      py = floor(px, pz);
    rbox(0.13, 0.07, 0.12, mat(0x2b2f36, 'satin'), px, py + 0.035, pz, 'Stazione saldante digitale RC', 0.006);
    rbox(0.004, 0.064, 0.112, satinBlack, px + 0.064, py + 0.035, pz, 'Mascherina frontale stazione saldante', 0.002);
    plane(
      0.048,
      0.022,
      decal('solder', 256, 112, lcdDraw(['320°C', 'SET 330'], { bg: '#2a0805', fg: '#ff5a36', size: 0.4 }), { glow: 0.8 }),
      px + 0.0665,
      py + 0.05,
      pz - 0.02,
      'Display 320 °C stazione saldante',
      [0, Math.PI / 2, 0]
    );
    lathe([[0, 0], [0.013, 0], [0.013, 0.012], [0.011, 0.016], [0, 0.016]], blackPlastic, px + 0.066, py + 0.03, pz + 0.032, 'Manopola temperatura saldatore', [0, 0, -Math.PI / 2], 24);
    rbox(0.004, 0.012, 0.018, kyoshoRed, px + 0.066, py + 0.016, pz - 0.035, 'Interruttore stazione saldante', 0.0015);
    cylinder(0.006, 0.006, satinBlack, px + 0.068, py + 0.016, pz + 0.005, 'Presa stilo saldatore', [0, 0, Math.PI / 2], 16);

    const hx = 0.05,
      hz = -0.56,
      hy = floor(hx, hz);
    rbox(0.1, 0.012, 0.075, mat(0x2b2f36, 'satin'), hx, hy + 0.006, hz, 'Base porta stilo saldatore', 0.004);
    rbox(0.05, 0.004, 0.04, mat(0xd9c27a, 'satin'), hx - 0.016, hy + 0.0135, hz + 0.01, 'Spugnetta pulisci punta', 0.002);
    cylinder(0.016, 0.014, chrome, hx + 0.03, hy + 0.019, hz + 0.018, 'Coppa lana ottone', [0, 0, 0], 28);
    part(new T.SphereGeometry(0.0135, 16, 10), mat(0xb8913f, 'satin'), hx + 0.03, hy + 0.024, hz + 0.018, 'Lana ottone pulisci punta');
    // Molla porta stilo inclinata a spirale
    const coil = [],
      base = new T.Vector3(hx + 0.005, hy + 0.03, hz - 0.02),
      dir = new T.Vector3(0.85, 0.53, 0).normalize(),
      ux = new T.Vector3(0, 0, 1),
      uy = new T.Vector3().crossVectors(dir, ux).normalize();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120,
        a = t * Math.PI * 2 * 11,
        r = 0.009 + t * 0.003;
      coil.push(
        base.clone().addScaledVector(dir, t * 0.08).addScaledVector(ux, Math.cos(a) * r).addScaledVector(uy, Math.sin(a) * r).toArray()
      );
    }
    tube(coil, 0.0009, chrome, 'Molla porta stilo saldatore', 600, 5);
    rod([hx - 0.02, hy + 0.012, hz - 0.02], [hx + 0.005, hy + 0.03, hz - 0.02], 0.003, chrome, 'Staffa molla porta stilo');
    // Stilo appoggiato nella molla: puntale, canna inox, impugnatura in silicone
    const tip = base.clone().addScaledVector(dir, -0.012),
      at = (d) => tip.clone().addScaledVector(dir, d).toArray();
    rod(at(0), at(0.018), 0.0012, chrome, 'Punta fine saldatore');
    rod(at(0.018), at(0.06), 0.0032, steel, 'Canna inox saldatore');
    rod(at(0.06), at(0.075), 0.0055, satinBlack, 'Paracalore stilo');
    rod(at(0.075), at(0.135), 0.0068, mat(0x2e3a48, 'rubber'), 'Impugnatura silicone stilo');
    rod(at(0.135), at(0.15), 0.004, satinBlack, 'Pressacavo stilo');
    const end = new T.Vector3(...at(0.15));
    tube(
      [end.toArray(), [end.x + 0.03, hy + 0.06, end.z + 0.03], [hx + 0.12, hy + 0.01, hz + 0.06], [px + 0.075, py + 0.012, pz + 0.04], [px + 0.068, py + 0.016, pz + 0.005]],
      0.0022,
      satinBlack,
      'Cavo silicone saldatore',
      40,
      8
    );
  }

  // 11. Lampada LED da banco a braccio bilanciato con molle, testa con lente d'ingrandimento
  {
    const lx = -0.33,
      lz = -0.33,
      ly = floor(lx, lz);
    lathe([[0, 0], [0.07, 0], [0.072, 0.004], [0.068, 0.018], [0.02, 0.022], [0, 0.022]], satinBlack, lx, ly, lz, 'Base zavorrata lampada', [0, 0, 0], 40);
    cylinder(0.012, 0.03, satinBlack, lx, ly + 0.035, lz, 'Snodo base lampada', [0, 0, 0], 20);
    const j0 = [lx, ly + 0.05, lz],
      j1 = [lx + 0.05, ly + 0.33, lz + 0.03],
      j2 = [-0.03, ly + 0.43, -0.07];
    for (const o of [-0.007, 0.007]) {
      rod([j0[0], j0[1], j0[2] + o], [j1[0], j1[1], j1[2] + o], 0.0035, satinBlack, 'Braccio inferiore lampada');
      rod([j1[0], j1[1], j1[2] + o], [j2[0], j2[1], j2[2] + o], 0.003, satinBlack, 'Braccio superiore lampada');
    }
    for (const [a, b] of [[j0, j1], [j1, j2]]) {
      const A = new T.Vector3(...a),
        B = new T.Vector3(...b),
        d = B.clone().sub(A),
        n = d.clone().normalize(),
        side = new T.Vector3(0, 0, 1),
        up = new T.Vector3().crossVectors(side, n).normalize(),
        pts = [];
      for (let i = 0; i <= 160; i++) {
        const t = 0.25 + (i / 160) * 0.4,
          a2 = i * 0.9;
        pts.push(A.clone().addScaledVector(d, t).addScaledVector(up, 0.009).addScaledVector(side, Math.cos(a2) * 0.0035).addScaledVector(up, Math.sin(a2) * 0.0035).toArray());
      }
      tube(pts, 0.0007, steel, 'Molla di bilanciamento lampada', 480, 4);
    }
    for (const p of [j1, j2]) cylinder(0.011, 0.024, mat(0x3a3f47, 'anodized'), ...p, 'Snodo frizionato lampada', [Math.PI / 2, 0, 0], 20);
    // Testa circolare con anello LED e lente
    const head = new T.Group();
    head.position.set(-0.01, ly + 0.405, -0.06);
    head.rotation.set(0, 0, 0.1);
    root.add(head);
    const hp = primitives(head);
    hp.part(new T.TorusGeometry(0.06, 0.011, 16, 64), mat(0xe9ecef, 'plastic'), 0, 0, 0, 'Corona lampada con lente', [Math.PI / 2, 0, 0]);
    hp.part(new T.TorusGeometry(0.06, 0.0045, 8, 64), led, 0, -0.008, 0, 'Anello LED lampada', [Math.PI / 2, 0, 0]);
    const lens = hp.part(
      new T.CylinderGeometry(0.052, 0.052, 0.004, 48),
      new T.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.03, transparent: true, opacity: 0.18, depthWrite: false }),
      0,
      0,
      0,
      'Lente d\'ingrandimento lampada'
    );
    lens.userData.unbatched = true;
    lens.castShadow = false;
    hp.rbox(0.03, 0.012, 0.016, mat(0xe9ecef, 'plastic'), 0.07, 0, 0, 'Attacco testa lampada', 0.004);
  }

  // 12. Organizer ricambi con coperchio trasparente: ammortizzatori, molle, pignoni, viti e piastre in carbonio
  {
    const ox = 0.1,
      oz = 0.6,
      oy = floor(ox, oz),
      W = 0.2,
      D = 0.13;
    const shell = mat(0x30353c, 'plastic');
    rbox(W, 0.003, D, shell, ox, oy + 0.0015, oz, 'Organizer ricambi MR-04', 0.0012);
    for (const s of [-1, 1]) {
      rbox(W, 0.026, 0.003, shell, ox, oy + 0.013, oz + s * (D / 2 - 0.0015), 'Parete organizer', 0.001);
      rbox(0.003, 0.026, D, shell, ox + s * (W / 2 - 0.0015), oy + 0.013, oz, 'Parete organizer', 0.001);
    }
    for (let i = 1; i < 5; i++) box(0.0018, 0.022, D - 0.008, greyPlastic, ox - W / 2 + i * (W / 5), oy + 0.016, oz, 'Divisorio organizer');
    box(W - 0.008, 0.022, 0.0018, greyPlastic, ox, oy + 0.016, oz, 'Divisorio organizer');
    const fill = [
      (cx, cz) => { for (let k = 0; k < 4; k++) cylinder(0.0035, 0.012, k % 2 ? mat(0xd4d8dc, 'steel') : kyoshoRed, cx - 0.012 + k * 0.008, oy + 0.006, cz, 'Molla ammortizzatore ricambio', [Math.PI / 2, 0, 0], 12); },
      (cx, cz) => { for (let k = 0; k < 6; k++) cylinder(0.0028, 0.003, brass, cx - 0.012 + (k % 3) * 0.012, oy + 0.006, cz - 0.008 + Math.floor(k / 3) * 0.014, 'Pignone ottone', [0, 0, 0], 9); },
      (cx, cz) => { for (let k = 0; k < 3; k++) rbox(0.03, 0.0016, 0.046, mat(0x16181b, 'gloss'), cx, oy + 0.004 + k * 0.0017, cz, 'Piastra carbonio T-plate', 0.002, [0, k * 0.08, 0]); },
      (cx, cz) => { for (let k = 0; k < 10; k++) cylinder(0.0016, 0.006, k % 2 ? steel : anodGold, cx - 0.012 + (k % 5) * 0.006, oy + 0.005, cz - 0.01 + Math.floor(k / 5) * 0.02, 'Viti M2 ricambio', [Math.PI / 2, 0, 0.4 * k], 8); },
      (cx, cz) => { for (let k = 0; k < 4; k++) cylinder(0.005, 0.0025, k % 2 ? anodBlue : anodGold, cx - 0.008 + (k % 2) * 0.016, oy + 0.005, cz - 0.01 + Math.floor(k / 2) * 0.02, 'Ralla anodizzata', [0, 0, 0], 20); }
    ];
    for (let i = 0; i < 5; i++) {
      for (const r of [-1, 1]) fill[(i + (r > 0 ? 2 : 0)) % 5](ox - W / 2 + (i + 0.5) * (W / 5), oz + r * D * 0.25);
    }
    const lid = rbox(
      W + 0.002,
      0.006,
      D + 0.002,
      new T.MeshStandardMaterial({ color: 0xe6eef3, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
      ox,
      oy + 0.029,
      oz,
      'Coperchio trasparente organizer',
      0.003
    );
    lid.userData.unbatched = true;
    lid.castShadow = false;
    box(0.03, 0.006, 0.008, greyPlastic, ox, oy + 0.02, oz + D / 2 + 0.003, 'Chiusura organizer');
  }

  // 13. Scatola porta pile AAA con 8 ministilo di scorta
  {
    const ax = 0.25,
      az = 0.45,
      ay = floor(ax, az);
    rbox(0.05, 0.016, 0.06, mat(0xd8dde2, 'plastic'), ax, ay + 0.008, az, 'Box pile AAA di scorta', 0.003);
    for (let i = 0; i < 8; i++) {
      const cx = ax - 0.0185 + (i % 4) * 0.0123,
        cz = az - 0.012 + Math.floor(i / 4) * 0.024;
      cylinder(0.0052, 0.02, mat(i < 4 ? 0x0b6fb3 : 0x1a1a1a, 'gloss'), cx, ay + 0.018, cz, 'Pila AAA Ni-MH di scorta', [0, 0, 0], 20);
      cylinder(0.0018, 0.0014, steel, cx, ay + 0.0287, cz, 'Polo positivo pila', [0, 0, 0], 10);
    }
  }

  if (worker) {
    const floorY = worker.y ?? FLOOR - y;
    const person = part(benchWorkerGeometry, palettes.satin, worker.x, floorY, worker.z, `Socio seduto di spalle · ${room}`, [
      0,
      worker.rotation,
      0
    ]);
    person.userData.staticBenchWorker = true;
    root.userData.benchWorker = person.name;
    if (worker.stool !== false) {
      cylinder(0.17, 0.04, M.blackPlastic || M.molded, worker.x, floorY + 0.615, worker.z, 'Seduta socio al banco');
      cylinder(0.024, 0.6, M.metal || M.railProps, worker.x, floorY + 0.3, worker.z, 'Piantana seduta socio');
      cylinder(0.22, 0.018, M.darkMetal, worker.x, floorY + 0.009, worker.z, 'Base seduta socio');
    }
  }
  batch(root, excluded);
  root.rotation.y = rotation;
  return root;
}

export function stockWallShelves(scene, M, details, { x, z, y, length, room, side = 1, rows = 3 }) {
  const root = new T.Group();
  root.name = `Ricambi sulle mensole ${room}`;
  root.position.set(x, y, z);
  scene.add(root);
  const { box, part } = primitives(root);
  const rubberMat = M.rubber || paint(0x141619);
  const silverAlu = paint(0xcbd5e1);
  const anodBlue = paint(0x1d4ed8);

  for (let row = 0; row < rows; row++) {
    const level = row * 0.33;
    for (let i = 0; i < Math.floor(length / 0.38); i++) {
      const Z = -length / 2 + 0.21 + i * 0.38,
        colour = paint([0x236397, 0xaaaead, 0xa6372d, 0x30443b][(i + row) % 4]);
      box(0.23, 0.115, 0.31, colour, 0, level + 0.061, Z, 'Scatola ricambi Mini-Z');
      const p = part(
        new T.PlaneGeometry(0.27, 0.065),
        new T.MeshStandardMaterial({
          map: details.boxLabels[(i + row) % details.boxLabels.length],
          roughness: 0.7
        }),
        side * 0.117,
        level + 0.07,
        Z,
        'Etichetta scatola ricambi',
        [0, side * (Math.PI / 2), 0]
      );
      p.castShadow = false;
    }
    box(0.035, 0.003, length - 0.1, paint(0xf2c830), side * 0.16, level + 0.01, 0, 'Etichetta bordo ripiano');
  }
  for (let j = 0; j < 4; j++) {
    addSpareMiniZWheel(
      part,
      rubberMat,
      silverAlu,
      anodBlue,
      side * 0.16,
      0.33 + 0.005,
      -length / 2 + 0.04 + j * 0.028,
      true,
      true,
      0
    );
  }
  batch(root);
  return root;
}

export function buildClubAmenities(scene, M, room) {
  const root = new T.Group();
  root.name = `Arredi di servizio ${room}`;
  root.position.set(7.9, FLOOR, ROOM.z0 + 0.38);
  scene.add(root);
  const { box, cylinder, part } = primitives(root),
    grey = paint(0x5e6e7b),
    blue = paint(0x275b80),
    red = paint(0xb52d26),
    metal = M.metal || M.railProps;
  box(1.4, 1.35, 0.46, grey, 0, 0.715, 0, 'Armadio ricambi');
  for (const X of [-0.34, 0.34]) {
    box(0.67, 1.27, 0.016, paint(0xbcc3c6), X, 0.73, 0.238, 'Anta armadio');
    box(0.018, 0.17, 0.025, M.darkMetal, X + (X < 0 ? 0.24 : -0.24), 0.77, 0.264, 'Maniglia armadio');
  }
  for (const X of [-0.55, 0.55])
    for (const Z of [-0.15, 0.15]) box(0.04, 0.055, 0.04, M.darkMetal, X, 0.0275, Z, 'Piedino armadio');
  label(root, `${room.toUpperCase()} · RICAMBI`, 1.17, 0.08, 0, 1.3, 0.249);
  box(0.39, 0.09, 0.28, blue, -0.28, 1.44, 0, 'Valigetta radiocomando');
  box(0.17, 0.035, 0.016, M.darkMetal, -0.28, 1.502, 0, 'Maniglia valigetta');
  box(0.3, 0.1, 0.25, red, 0.27, 1.445, 0, 'Kit ricambi');

  cylinder(0.07, 0.38, red, -1.02, 0.4, 0, 'Estintore');
  cylinder(0.026, 0.055, metal, -1.02, 0.62, 0, 'Valvola estintore');
  box(0.11, 0.025, 0.035, M.darkMetal, -1.02, 0.665, 0, 'Leva estintore');
  part(new T.SphereGeometry(0.02, 8, 6), M.white, -1.02, 0.64, 0.04, 'Manometro estintore');
  const hose = new T.CatmullRomCurve3(
    [
      [-0.98, 0.65, 0],
      [-0.89, 0.61, 0],
      [-0.89, 0.31, 0],
      [-0.94, 0.24, 0]
    ].map((v) => new T.Vector3(...v))
  );
  part(new T.TubeGeometry(hose, 16, 0.01, 8, false), M.rubber, 0, 0, 0, 'Tubo estintore');
  cylinder(0.016, 0.08, M.darkMetal, -0.94, 0.21, 0, 'Cono erogatore estintore', [0, 0, -0.35]);
  batch(root);
  return root;
}
