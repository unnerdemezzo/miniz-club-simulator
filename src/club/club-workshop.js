import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCar } from './car.js';
import { DRIVERS, FLOOR, ROOM } from './config.js';
import { canvasTex } from './util.js';
import { benchWorkerGeometry } from './bench-worker.js';

const colours = new Map();
const paint = (colour) => {
  if (!colours.has(colour)) {
    colours.set(colour, new T.MeshStandardMaterial({ color: colour, roughness: 0.48, metalness: 0.15 }));
  }
  return colours.get(colour);
};
const led = new T.MeshBasicMaterial({ color: 0xfff4dc });
const palette = new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55 });

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
    }
  };
}

// Unisce tutte le geometrie statiche del banco per materiale (zero perdita di FPS anche con tantissimi dettagli!)
function batch(root, exclude) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(),
    groups = new Map(),
    meshes = [];
  const painted = new Set(colours.values());
  root.traverse((o) => {
    if (!o.isMesh || exclude?.includes(o) || o.userData.unbatched) return;
    meshes.push(o);
    const material = painted.has(o.material) ? palette : o.material;
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push(o);
  });
  root.userData.inventory = meshes.map((o) => o.name);
  for (const [material, items] of groups) {
    const parts = items.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      if (material === palette) {
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
      }
      for (const k of Object.keys(g.attributes)) {
        if (material === palette) {
          if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
        } else {
          if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        }
      }
      g.clearGroups();
      return g;
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Dettagli officina raggruppati';
    mesh.castShadow = mesh.receiveShadow = !material.isMeshBasicMaterial;
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

// Costruisce una vera ruota di ricambio Kyosho Mini-Z (gomma slick con spalla smussata + cerchio racing a 10 razze + dado M2)
function addSpareMiniZWheel(part, rubberMat, rimMat, nutMat, x, y, z, isRear = false, standing = false, rotY = 0) {
  const width = isRear ? 0.0135 : 0.0105;
  const R = 0.0125;
  const rimR = 0.0085;
  const sh = 0.0015;
  const hw = width / 2;

  const tirePts = [
    [rimR, -hw],
    [R - sh, -hw],
    [R - sh * 0.3, -hw + sh * 0.3],
    [R, -hw + sh],
    [R, hw - sh],
    [R - sh * 0.3, hw - sh * 0.3],
    [R - sh, hw],
    [rimR, hw]
  ].map(([r, py]) => new T.Vector2(r, py));
  const tireGeo = new T.LatheGeometry(tirePts, 32);
  const rimGeo = new T.CylinderGeometry(rimR, rimR, width * 0.88, 24);
  const innerHoleGeo = new T.CylinderGeometry(rimR * 0.78, rimR * 0.78, width * 0.92, 24);

  const rot = standing ? [0, rotY, Math.PI / 2] : [0, rotY, 0];
  const wy = standing ? y + R : y + hw;

  part(tireGeo, rubberMat, x, wy, z, 'Pneumatico slick di ricambio Mini-Z', rot);
  part(rimGeo, rimMat, x, wy, z, 'Cerchio racing Mini-Z', rot);
  part(innerHoleGeo, rubberMat, x, wy, z, ' Mozzo interno cerchio', rot);

  // Razze del cerchio + dado centrale anodizzato
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI;
    const sg = new T.BoxGeometry(rimR * 1.72, width * 0.94, 0.0012);
    sg.rotateY(a);
    part(sg, rimMat, x, wy, z, 'Razza cerchio ricambio', rot);
  }
  const nutGeo = new T.CylinderGeometry(0.0022, 0.0022, width * 1.02, 6);
  part(nutGeo, nutMat, x, wy, z, 'Dado ruota M2 anodizzato', rot);
}

export function buildBenchEquipment(
  scene,
  M,
  { x, y, z, room, car = true, stand = false, rotation = 0, supplement = false, worker = null }
) {
  const root = new T.Group();
  root.name = `Attrezzatura banco ${room}`;
  root.position.set(x, y, z);
  scene.add(root);

  const { part, box, rbox, cylinder, rod } = primitives(root);
  const kyoshoRed = paint(0xb91c1c);
  const anodBlue = paint(0x1d4ed8);
  const anodGold = paint(0xd97706);
  const gunmetal = paint(0x334155);
  const darkCase = paint(0x1e2430);
  const brass = paint(0xc79743);
  const silverAlu = paint(0xcbd5e1);
  const cellWrapCol = paint(0x0284c7);
  const metal = M.metal || M.railProps;
  const rubberMat = M.rubber || paint(0x141619);

  // 1. Tappetino magnetico nero da manutenzione RC (Pit Mat 19×28 cm con bordino rialzato)
  rbox(0.21, 0.005, 0.30, M.blackPlastic || M.molded, 0.0, 0.0025, -0.02, 'Tappetino pit magnetico RC', 0.002);

  if (stand) {
    // Vero Cavalletto girevole da Setup Kyosho / PN Racing in alluminio anodizzato blu/titanio!
    // La piastra superiore arriva esattamente a y = 0.0316 m così il fondo piatto del telaio MR-04 (y_min = 0.0034m con auto a y = +0.0282m)
    // APPOGGIA FISICAMENTE SUL SUPPORTO lasciando le 4 ruote sollevate di 9 mm nell'aria!
    rbox(0.068, 0.004, 0.104, gunmetal, 0, 0.007, -0.02, 'Base cavalletto setup Mini-Z', 0.0015);
    // 4 colonnine in alluminio tornito + piastra centrale alleggerita
    for (const sx of [-0.021, 0.021]) {
      for (const sz of [-0.036, 0.036]) {
        cylinder(0.0045, 0.019, anodBlue, sx, 0.0185, -0.02 + sz, 'Colonnina cavalletto anodizzata', [0, 0, 0], 20);
      }
    }
    rbox(0.054, 0.017, 0.072, anodBlue, 0, 0.0185, -0.02, 'Corpo centrale cavalletto Kyosho', 0.002);
    rbox(0.058, 0.0032, 0.092, gunmetal, 0, 0.0284, -0.02, 'Piastra superiore cavalletto setup', 0.0012);
    // 2 strisce di gomma neoprenica antiscivolo a filo con la piastra del telaio MR-04 (top a y = 0.0316 m)
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

  // 2. Vera Rastrelliera Portagomme Mini-Z (Tire Rack in alluminio con 4 ruote complete montate + 4 stese sul banco!)
  rbox(0.115, 0.004, 0.048, gunmetal, -0.195, 0.004, 0.25, 'Base rastrelliera gomme Mini-Z', 0.0015);
  for (const sx of [-0.245, -0.145]) {
    rbox(0.004, 0.036, 0.042, gunmetal, sx, 0.022, 0.25, 'Fianco rastrelliera gomme', 0.001);
  }
  rod([-0.245, 0.026, 0.25], [-0.145, 0.026, 0.25], 0.0022, silverAlu, 'Asta portagomme Mini-Z');
  // 4 ruote slick in verticale sulla rastrelliera
  for (let i = 0; i < 4; i++) {
    addSpareMiniZWheel(
      part,
      rubberMat,
      silverAlu,
      i < 2 ? anodBlue : kyoshoRed,
      -0.228 + i * 0.022,
      0.006,
      0.25,
      i >= 2,
      true,
      Math.PI / 2
    );
  }
  // 4 ruote di ricambio stese con il cerchio a 10 razze e dado M2 rivolti verso l'alto (ben visibili vicino all'auto!)
  const flatWheels = [
    [-0.145, 0.14, false, anodBlue],
    [-0.112, 0.14, false, anodBlue],
    [-0.145, 0.176, true, kyoshoRed],
    [-0.112, 0.176, true, kyoshoRed]
  ];
  for (const [wx, wz, isRear, nutCol] of flatWheels) {
    addSpareMiniZWheel(part, rubberMat, silverAlu, nutCol, wx, 0.005, wz, isRear, false, 0);
  }

  // 3. Caricabatterie Professionale 4×AAA Ni-MH (SkyRC NC1500 / Kyosho Speed House) con 4 pile ministilo inserite!
  rbox(0.092, 0.026, 0.118, darkCase, -0.175, 0.015, -0.16, 'Caricabatterie digitale 4xAAA Ni-MH', 0.003);
  rbox(0.078, 0.006, 0.026, gunmetal, -0.175, 0.027, -0.202, 'Cruscotto LCD caricabatterie', 0.001);
  label(root, '1.42V  800mAh  FULL', 0.072, 0.016, -0.175, 0.029, -0.188, 0, '#07131f', '#22c55e');
  // 4 slot con vere batterie ministilo AAA Ni-MH Speed House inserite e contatti metallici
  for (let c = 0; c < 4; c++) {
    const cx = -0.205 + c * 0.020;
    rbox(0.014, 0.008, 0.052, M.blackPlastic, cx, 0.026, -0.145, 'Vano cella AAA caricabatterie', 0.001);
    cylinder(0.0052, 0.044, cellWrapCol, cx, 0.029, -0.145, 'Batteria AAA Ni-MH in carica', [Math.PI / 2, 0, 0], 20);
    cylinder(0.002, 0.046, silverAlu, cx, 0.029, -0.145, 'Polo positivo AAA', [Math.PI / 2, 0, 0], 12);
  }

  // 4. Vassoio magnetico in alluminio anodizzato blu diviso in 3 scomparti con viti M2, dadi ruota e pignoni in ottone
  rbox(0.088, 0.011, 0.068, anodBlue, 0.145, 0.006, 0.135, 'Vassoio magnetico porta-viti anodizzato', 0.002);
  rbox(0.078, 0.008, 0.058, silverAlu, 0.145, 0.008, 0.135, 'Fondo magnetico inox', 0.001);
  for (let i = 0; i < 2; i++) {
    rbox(0.0025, 0.011, 0.060, anodBlue, 0.118 + i * 0.027, 0.007, 0.135, 'Divisorio vassoio magnetico', 0.0005);
  }
  for (let i = 0; i < 9; i++) {
    const sx = 0.105 + (i % 3) * 0.027;
    const sz = 0.119 + Math.floor(i / 3) * 0.016;
    cylinder(0.0022, 0.0055, i % 2 === 0 ? brass : silverAlu, sx, 0.013, sz, 'Pignone / Vite M2 Mini-Z', [0, 0, 0], 12);
  }

  // 5. Set di 4 Cacciaviti Esagonali MIP / Hudy (1.5mm, 2.0mm, Chiave Dadi 4.5mm) con manici in alluminio lavorato CNC (ben visibili sul banco senza toccare le gomme!)
  const driverColors = [kyoshoRed, anodBlue, anodGold, gunmetal];
  for (let i = 0; i < 4; i++) {
    const dx = -0.025 + i * 0.019;
    const dz = 0.165;
    // Manico cilindrico ergonomico con anelli anodizzati e cappuccio girevole
    cylinder(0.0064, 0.066, gunmetal, dx, 0.008, dz, 'Impugnatura cacciavite Hudy/MIP', [Math.PI / 2, 0, 0], 20);
    cylinder(0.0068, 0.015, driverColors[i], dx, 0.008, dz + 0.016, 'Fascia colore misura cacciavite', [Math.PI / 2, 0, 0], 20);
    cylinder(0.0060, 0.006, silverAlu, dx, 0.008, dz + 0.032, 'Tappo girevole cacciavite', [Math.PI / 2, 0, 0], 20);
    // Stelo in acciaio al titanio brunito
    cylinder(0.0014, 0.056, brass, dx, 0.008, dz - 0.054, 'Punta esagonale rettificata', [Math.PI / 2, 0, 0], 12);
  }

  // 6. Boccette in silicone per Olio Ammortizzatori / Grasso Differenziale a Sfere + Calibro Altezza Terra (Ride Height Gauge)
  for (let b = 0; b < 2; b++) {
    const bx = -0.180 + b * 0.036;
    const bz = 0.025;
    cylinder(0.012, 0.042, silverAlu, bx, 0.022, bz, 'Flacone olio siliconico Kyosho', [0, 0, 0], 20);
    cylinder(0.008, 0.010, b === 0 ? kyoshoRed : anodBlue, bx, 0.048, bz, 'Ghiera tappo flacone', [0, 0, 0], 16);
    part(new T.ConeGeometry(0.0035, 0.016, 12), b === 0 ? kyoshoRed : anodBlue, bx, 0.060, bz, 'Beccuccio dosatore');
  }
  // Squadretta camber / calibro altezza telaio a gradini in alluminio anodizzato rosso con righello
  rbox(0.036, 0.003, 0.052, kyoshoRed, -0.155, 0.004, 0.095, 'Calibro camber e altezza Mini-Z', 0.001, [0, 0.15, 0]);
  label(root, '1.0  1.5  2.0 mm', 0.032, 0.012, -0.155, 0.0058, 0.095, 0.15, '#991b1b', '#ffffff', true);

  // 7. Stazione Saldante Digitale Hakko / SkyRC con display OLED, supporto e stilo
  rbox(0.14, 0.062, 0.12, darkCase, 0.14, 0.034, -0.52, 'Stazione saldante digitale RC', 0.004);
  rbox(0.132, 0.054, 0.006, anodBlue, 0.14, 0.034, -0.459, 'Mascherina frontale stazione saldante', 0.002);
  label(root, '350 °C  READY', 0.082, 0.024, 0.125, 0.040, -0.454, 0, '#07111e', '#38bdf8');
  cylinder(0.009, 0.012, silverAlu, 0.182, 0.028, -0.452, 'Encoder temperatura saldatore', [Math.PI / 2, 0, 0], 20);
  rbox(0.085, 0.008, 0.13, gunmetal, -0.05, 0.006, -0.52, 'Base porta stilo saldatore', 0.002);
  rod([-0.05, 0.038, -0.56], [-0.05, 0.075, -0.46], 0.009, metal, 'Boccola porta saldatore');
  rod([-0.05, 0.032, -0.62], [-0.05, 0.058, -0.54], 0.011, anodBlue, 'Impugnatura stilo saldatore');
  rod([-0.05, 0.058, -0.54], [-0.05, 0.092, -0.43], 0.003, silverAlu, 'Punta fine saldatore');
  rbox(0.055, 0.006, 0.055, anodGold, -0.05, 0.010, -0.555, 'Spugnetta ottone pulisci punta', 0.001);
  const cable = new T.CatmullRomCurve3(
    [
      [-0.05, 0.032, -0.62],
      [-0.14, 0.016, -0.66],
      [-0.16, 0.014, -0.48],
      [0.09, 0.015, -0.47]
    ].map((v) => new T.Vector3(...v))
  );
  part(new T.TubeGeometry(cable, 20, 0.0022, 6, false), M.darkMetal, 0, 0, 0, 'Cavo silicone saldatore');

  // 8. Lampada da banco orientabile a braccio snodato con plafoniera LED larga sopra il telaio MR-04
  cylinder(0.062, 0.016, gunmetal, 0.22, 0.008, -0.26, 'Base pesante lampada da laboratorio', [0, 0, 0], 28);
  rod([0.22, 0.016, -0.26], [0.20, 0.29, -0.24], 0.0065, metal, 'Braccio inferiore lampada');
  rod([0.20, 0.29, -0.24], [-0.01, 0.41, -0.08], 0.0055, metal, 'Braccio superiore lampada');
  for (const p of [
    [0.20, 0.29, -0.24],
    [-0.01, 0.41, -0.08]
  ]) {
    part(new T.SphereGeometry(0.012, 14, 10), anodBlue, ...p, 'Snodo frizionato lampada');
  }
  rbox(0.18, 0.016, 0.068, darkCase, -0.01, 0.408, -0.04, 'Plafoniera LED banco box', 0.003, [0, 0, 0.12]);
  rbox(0.168, 0.004, 0.056, led, -0.01, 0.399, -0.04, 'Pannello diffusore LED banco', 0.001, [0, 0, 0.12]);

  // 9. Alimentatore stabilizzato da banco 13.8V + Programmatore Kyosho ICS USB + Valigetta Ricambi
  rbox(0.165, 0.068, 0.155, darkCase, 0.04, 0.036, 0.48, 'Alimentatore stabilizzato da banco 13.8V', 0.004);
  rbox(0.155, 0.058, 0.006, gunmetal, 0.04, 0.036, 0.558, 'Pannello frontale alimentatore', 0.002);
  label(root, '13.8V   4.2A   ON', 0.115, 0.025, 0.03, 0.042, 0.563, 0, '#07131f', '#38bdf8');
  cylinder(0.006, 0.012, kyoshoRed, 0.098, 0.022, 0.562, 'Boccola +13.8V rossa', [Math.PI / 2, 0, 0], 16);
  cylinder(0.006, 0.012, M.blackPlastic, 0.078, 0.022, 0.562, 'Boccola GND nera', [Math.PI / 2, 0, 0], 16);

  rbox(0.088, 0.018, 0.135, kyoshoRed, 0.195, 0.011, 0.68, 'Tester / Programmatore Kyosho ICS', 0.003);
  label(root, 'ICS SETUP OK', 0.062, 0.020, 0.195, 0.021, 0.749, 0, '#0a111a', '#facc15');

  rbox(0.155, 0.044, 0.115, gunmetal, -0.13, 0.024, 0.84, 'Cassetta ricambi carbonio & molle', 0.003);
  label(root, 'MR-04 PARTS · M2', 0.125, 0.022, -0.13, 0.027, 0.899, 0, '#111827', '#f8fafc');

  if (supplement) {
    for (const o of [...root.children]) {
      if (!/salda|Spugnetta|Vaschetta|Vassoio|Divisorio|Pignone|350/.test(o.name)) o.removeFromParent();
    }
  }
  if (worker) {
    const floor = worker.y ?? FLOOR - y;
    const person = part(benchWorkerGeometry, palette, worker.x, floor, worker.z, `Socio seduto di spalle · ${room}`, [
      0,
      worker.rotation,
      0
    ]);
    person.userData.staticBenchWorker = true;
    root.userData.benchWorker = person.name;
    if (worker.stool !== false) {
      cylinder(0.17, 0.04, M.blackPlastic || M.molded, worker.x, floor + 0.615, worker.z, 'Seduta socio al banco');
      cylinder(0.024, 0.6, metal, worker.x, floor + 0.3, worker.z, 'Piantana seduta socio');
      cylinder(0.22, 0.018, M.darkMetal, worker.x, floor + 0.009, worker.z, 'Base seduta socio');
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
