import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Telaio Kyosho Mini-Z MR-04 EVO2 in scala reale (metri).
// Assi locali dell'auto: +Z = muso, +X = lato sinistro, +Y = alto, Y = 0 è il tappeto.
// Misure di riferimento: passo 98 mm, carreggiata 66 mm, ruote Ø 25 mm, 4 celle AAA (44,5 × 10,5 mm).

let carbonTexCache = null;
function carbonWeaveTexture() {
  if (carbonTexCache) return carbonTexCache;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#141518';
  g.fillRect(0, 0, 128, 128);
  // Trama twill 2x2 del carbonio: blocchi alternati con riflesso diverso
  const s = 8;
  for (let y = 0; y < 128 / s; y++) {
    for (let x = 0; x < 128 / s; x++) {
      const k = (x + Math.floor(y / 2)) % 4 < 2;
      const grad = k
        ? g.createLinearGradient(x * s, y * s, x * s + s, y * s)
        : g.createLinearGradient(x * s, y * s, x * s, y * s + s);
      grad.addColorStop(0, k ? '#1b1d21' : '#0f1012');
      grad.addColorStop(0.5, k ? '#2a2d33' : '#1a1c20');
      grad.addColorStop(1, k ? '#1b1d21' : '#0f1012');
      g.fillStyle = grad;
      g.fillRect(x * s, y * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = 8;
  carbonTexCache = tex;
  return tex;
}

function cellWrapTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2f36';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#b8742a';
  g.fillRect(0, 0, 256, 7);
  g.fillRect(0, 57, 256, 7);
  g.fillStyle = '#d9d6cf';
  g.font = 'bold 15px Arial';
  g.textAlign = 'center';
  g.fillText('Ni-MH  1.2V  800mAh', 128, 30);
  g.font = '11px Arial';
  g.fillStyle = '#9ea3ab';
  g.fillText('MINI-Z RACING CELL  AAA', 128, 47);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // La scritta corre lungo la cella, come sulle vere pile ministilo
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI / 2;
  return tex;
}

function pcbTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1d3528';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = 'rgba(190, 160, 90, 0.55)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    const x = 8 + ((i * 37) % 112);
    const y = 8 + ((i * 53) % 240);
    g.moveTo(x, y);
    g.lineTo(x + ((i % 3) - 1) * 30, y + 18);
    g.lineTo(x + ((i % 3) - 1) * 30, y + 44);
    g.stroke();
  }
  g.fillStyle = 'rgba(230, 230, 220, 0.75)';
  g.font = 'bold 13px Arial';
  g.fillText('MR-04 EVO2', 18, 236);
  g.fillText('ICS  2.4G', 30, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Elica di una molla a spirale lungo l'asse Y locale (poi orientabile)
function helixGeometry(radius, height, turns, wire) {
  const pts = [];
  const steps = Math.round(turns * 18);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height - height / 2, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, wire, 5, false);
}

// Sagoma estrusa vista dall'alto: punti (x, z) -> spessore verso l'alto a partire da y0
function plateFromOutline(points, thickness, y0, bevel = 0.0004) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + bevel, 0);
  return geo;
}

function mirrorOutline(halfPoints) {
  // halfPoints: lato +X dal muso alla coda; restituisce il contorno chiuso simmetrico
  const right = halfPoints.map(([x, z]) => [x, z]);
  const left = halfPoints.slice().reverse().map(([x, z]) => [-x, z]);
  return [...right, ...left];
}

export function buildMR04Chassis({ wheelbase = 0.098, wheelRadius = 0.0125, halfTrack = 0.033 } = {}) {
  const root = new THREE.Group();
  root.name = 'Telaio Kyosho MR-04 EVO2';
  const halfWb = wheelbase / 2;

  // --- Materiali realistici e poco saturi ---
  const carbon = new THREE.MeshPhysicalMaterial({
    map: carbonWeaveTexture(),
    roughness: 0.42,
    metalness: 0.15,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18
  });
  const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.62, metalness: 0.0 });
  const greyPlastic = new THREE.MeshStandardMaterial({ color: 0x5c5f64, roughness: 0.55 });
  const whitePlastic = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.28, metalness: 0.95 });
  const alu = new THREE.MeshStandardMaterial({ color: 0x8e9298, roughness: 0.36, metalness: 0.9 });
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.34, metalness: 0.88 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d4a, roughness: 0.3, metalness: 0.95 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb87a52, roughness: 0.32, metalness: 0.95 });
  const pcb = new THREE.MeshStandardMaterial({ map: pcbTexture(), roughness: 0.5, metalness: 0.1 });
  const chip = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.45 });
  const cellWrap = new THREE.MeshStandardMaterial({ map: cellWrapTexture(), roughness: 0.35, metalness: 0.1 });
  const wireRed = new THREE.MeshStandardMaterial({ color: 0x8c2a26, roughness: 0.5 });
  const wireBlack = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.93, metalness: 0.0 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc4c7cc, roughness: 0.3, metalness: 0.85 });
  const springMat = new THREE.MeshStandardMaterial({ color: 0xb0a048, roughness: 0.32, metalness: 0.85 });
  const motorCanMat = new THREE.MeshStandardMaterial({ color: 0x3f5f8a, roughness: 0.3, metalness: 0.85 });

  const staticParts = [];
  const add = (geo, mat, x = 0, y = 0, z = 0, rot = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    staticParts.push(m);
    return m;
  };
  const rbox = (w, h, d, mat, x, y, z, r = 0.0006, rot = null) =>
    add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat, x, y, z, rot);
  const cylX = (r, len, mat, x, y, z, seg = 16) => add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, [0, 0, Math.PI / 2]);
  const cylZ = (r, len, mat, x, y, z, seg = 16) => add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, [Math.PI / 2, 0, 0]);
  const cylY = (r, len, mat, x, y, z, seg = 16) => add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  const rod = (a, b, r, mat, seg = 8) => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const geo = new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg);
    const m = add(geo, mat, ...A.clone().add(B).multiplyScalar(0.5).toArray());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
    return m;
  };
  const wire = (points, r, mat) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 24, r, 6, false), mat);

  // ===== 1. Vasca principale in composito (fondo + paratie vani batterie) =====
  const tubOutline = mirrorOutline([
    [0.012, 0.086],
    [0.022, 0.078],
    [0.026, 0.062],
    [0.031, 0.040],
    [0.0335, 0.026],
    [0.0335, -0.030],
    [0.024, -0.040],
    [0.016, -0.050]
  ]);
  add(plateFromOutline(tubOutline, 0.0026, 0.0034), blackPlastic);

  // Paratie laterali e centrali dei vani batterie (2 celle per lato)
  for (const s of [-1, 1]) {
    rbox(0.0018, 0.0105, 0.050, blackPlastic, s * 0.0322, 0.0112, -0.004, 0.0006);
    rbox(0.0016, 0.0085, 0.050, blackPlastic, s * 0.0094, 0.0102, -0.004, 0.0005);
    // Sportello vano batterie ribaltato di lato (aperto per la manutenzione)
    rbox(0.0012, 0.009, 0.044, blackPlastic, s * 0.0365, 0.0105, -0.004, 0.0005, [0, 0, s * 0.35]);
    // Contatti batterie in rame alle due estremità del vano
    rbox(0.0215, 0.0085, 0.0007, copper, s * 0.0208, 0.0112, -0.004 + 0.0232, 0.0002);
    rbox(0.0215, 0.0085, 0.0007, copper, s * 0.0208, 0.0112, -0.004 - 0.0232, 0.0002);
  }

  // ===== 2. Quattro celle AAA Ni-MH con poli metallici =====
  const cellGeo = new THREE.CylinderGeometry(0.00525, 0.00525, 0.0425, 24);
  for (const x of [-0.0255, -0.0150, 0.0150, 0.0255]) {
    const cell = new THREE.Mesh(cellGeo, cellWrap);
    cell.rotation.set(Math.PI / 2, 0, 0);
    cell.position.set(x, 0.0113, -0.004);
    cell.castShadow = true;
    cell.receiveShadow = true;
    root.add(cell);
    cylZ(0.0047, 0.0008, steel, x, 0.0113, -0.004 + 0.0216, 18);
    cylZ(0.0047, 0.0008, steel, x, 0.0113, -0.004 - 0.0216, 18);
    cylZ(0.0018, 0.0012, steel, x, 0.0113, -0.004 + 0.0225, 12);
  }

  // ===== 3. Servo dello sterzo + scheda ICS / ricevente 2.4 GHz =====
  rbox(0.0165, 0.0075, 0.026, blackPlastic, 0, 0.0098, 0.018, 0.0008);
  rbox(0.0165, 0.0016, 0.044, pcb, 0, 0.0146, 0.004, 0.0003);
  // Componenti montati sulla scheda
  rbox(0.0065, 0.0012, 0.0065, chip, 0.003, 0.0160, 0.012, 0.0002);
  rbox(0.0045, 0.0010, 0.0045, chip, -0.004, 0.0159, 0.000, 0.0002);
  rbox(0.0030, 0.0008, 0.0050, chip, -0.004, 0.0158, 0.016, 0.0002);
  for (let i = 0; i < 3; i++) cylY(0.0011, 0.0028, greyPlastic, 0.005 - i * 0.0026, 0.0168, -0.008, 10);
  // Dissipatore dei finali di potenza (alluminio alettato)
  rbox(0.010, 0.0012, 0.010, alu, 0, 0.0161, -0.0135, 0.0002);
  for (let i = 0; i < 5; i++) rbox(0.010, 0.0026, 0.0007, alu, 0, 0.0178, -0.0175 + i * 0.002, 0.0002);
  // Interruttore di accensione e presa ICS
  rbox(0.004, 0.0028, 0.006, whitePlastic, 0.0062, 0.0167, 0.022, 0.0004);
  rbox(0.0016, 0.0016, 0.0022, blackPlastic, 0.0062, 0.0186, 0.022, 0.0003);
  rbox(0.005, 0.0022, 0.004, whitePlastic, -0.0055, 0.0164, 0.024, 0.0003);
  // LED di stato
  add(new THREE.SphereGeometry(0.0008, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3fb07a }), -0.0055, 0.0162, -0.002);
  // Antenna ricevente
  wire([[-0.006, 0.0158, 0.026], [-0.010, 0.019, 0.030], [-0.012, 0.021, 0.036], [-0.010, 0.022, 0.044]], 0.00045, wireBlack);

  // ===== 4. Avantreno a kingpin con molle elicoidali =====
  const fz = halfWb;
  // Braccio inferiore e piastra superiore in carbonio
  rbox(0.058, 0.0028, 0.010, blackPlastic, 0, 0.0074, fz, 0.0008);
  add(
    plateFromOutline(
      mirrorOutline([
        [0.010, fz + 0.007],
        [0.030, fz + 0.005],
        [0.030, fz - 0.005],
        [0.010, fz - 0.009]
      ]),
      0.0014,
      0.0172
    ),
    carbon
  );
  // Montanti della piastra superiore
  for (const s of [-1, 1]) cylY(0.0011, 0.0095, gunmetal, s * 0.009, 0.0128, fz, 10);
  // Kingpin in acciaio + molle colorate (cambiano col setup)
  const springGeos = [];
  for (const s of [-1, 1]) {
    cylY(0.00075, 0.0105, steel, s * 0.0278, 0.0128, fz, 8);
    const sg = helixGeometry(0.0023, 0.0070, 6, 0.00034);
    sg.translate(s * 0.0278, 0.0128, fz);
    springGeos.push(sg);
  }
  const springMesh = new THREE.Mesh(mergeGeometries(springGeos), springMat);
  springMesh.castShadow = true;
  root.add(springMesh);

  // Paraurti anteriore in plastica morbida
  add(
    plateFromOutline(
      [
        [-0.020, 0.0905],
        [-0.024, 0.0870],
        [-0.016, 0.0840],
        [0.016, 0.0840],
        [0.024, 0.0870],
        [0.020, 0.0905]
      ],
      0.0055,
      0.0042,
      0.0008
    ),
    blackPlastic
  );
  // Salvaservo e tirante sterzo
  rbox(0.004, 0.0024, 0.007, whitePlastic, 0, 0.0146, 0.0335, 0.0004);
  rod([-0.0262, 0.0118, fz - 0.0072], [0.0262, 0.0118, fz - 0.0072], 0.00055, steel);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.0011, 8, 6), brass, s * 0.0262, 0.0118, fz - 0.0072);
  rod([0, 0.0135, 0.0335], [0, 0.0122, fz - 0.0072], 0.0006, steel);
  // Supporti carrozzeria anteriore
  for (const s of [-1, 1]) cylY(0.0011, 0.020, blackPlastic, s * 0.016, 0.019, 0.070, 10);

  // ===== 5. Retrotreno: T-plate, banchino motore, motore, ingranaggi, differenziale =====
  const rz = -halfWb;
  add(
    plateFromOutline(
      [
        [-0.0055, -0.028],
        [0.0055, -0.028],
        [0.0055, -0.052],
        [0.021, -0.054],
        [0.021, -0.062],
        [-0.021, -0.062],
        [-0.021, -0.054],
        [-0.0055, -0.052]
      ],
      0.0015,
      0.0041
    ),
    carbon
  );
  // Banchino motore in alluminio anodizzato canna di fucile
  rbox(0.040, 0.0024, 0.034, gunmetal, 0, 0.0047, rz + 0.001, 0.0006);
  for (const s of [-1, 1]) rbox(0.0028, 0.0185, 0.034, gunmetal, s * 0.0205, 0.0138, rz + 0.001, 0.0008);
  // Asse posteriore passante in acciaio
  cylX(0.0012, 0.064, steel, 0, wheelRadius, rz, 12);
  // Corona dentata (spur) con denti reali + differenziale a sfere
  const spurX = 0.0085;
  cylX(0.0102, 0.0024, whitePlastic, spurX, wheelRadius, rz, 40);
  const teeth = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const tg = new THREE.BoxGeometry(0.0024, 0.0009, 0.0007);
    tg.rotateX(a);
    tg.translate(spurX, wheelRadius + Math.cos(a) * 0.0106, rz + Math.sin(a) * 0.0106);
    teeth.push(tg);
  }
  add(mergeGeometries(teeth), whitePlastic);
  cylX(0.0046, 0.006, alu, spurX - 0.004, wheelRadius, rz, 20);
  cylX(0.0024, 0.0028, steel, -0.0175, wheelRadius, rz, 6);
  // Motore brushless trasversale con pignone in ottone
  const motorY = wheelRadius + 0.0042;
  const motorZ = rz + 0.0128;
  const motorCan = new THREE.Mesh(new THREE.CylinderGeometry(0.0061, 0.0061, 0.0185, 28), motorCanMat);
  motorCan.rotation.z = Math.PI / 2;
  motorCan.position.set(-0.0015, motorY, motorZ);
  motorCan.castShadow = true;
  root.add(motorCan);
  for (let i = 0; i < 5; i++) cylX(0.0064, 0.0008, gunmetal, -0.008 + i * 0.0032, motorY, motorZ, 28);
  cylX(0.0056, 0.0028, blackPlastic, -0.0122, motorY, motorZ, 24);
  cylX(0.0030, 0.0024, brass, spurX + 0.0005, motorY, motorZ, 14);
  // Cavi motore rosso/nero verso la scheda ICS
  wire([[-0.0125, motorY + 0.003, motorZ], [-0.010, 0.020, -0.030], [-0.004, 0.0175, -0.019]], 0.00055, wireRed);
  wire([[-0.0125, motorY - 0.001, motorZ + 0.003], [-0.006, 0.0195, -0.031], [-0.001, 0.0172, -0.019]], 0.00055, wireBlack);
  // Ammortizzatore centrale a olio + molle laterali sul T-plate
  cylZ(0.0029, 0.016, alu, 0, 0.0098, -0.024, 18);
  cylZ(0.0007, 0.010, steel, 0, 0.0098, -0.036, 8);
  cylZ(0.0033, 0.002, gunmetal, 0, 0.0098, -0.0165, 18);
  const sideSpringGeos = [];
  for (const s of [-1, 1]) {
    const sg = helixGeometry(0.0016, 0.012, 7, 0.00028);
    sg.rotateX(Math.PI / 2);
    sg.translate(s * 0.012, 0.0085, -0.031);
    sideSpringGeos.push(sg);
  }
  add(mergeGeometries(sideSpringGeos), steel);
  // Supporto carrozzeria posteriore
  for (const s of [-1, 1]) cylY(0.0011, 0.020, blackPlastic, s * 0.0205, 0.031, rz - 0.010, 10);

  // ===== 6. Ruote: cerchi a 10 razze + gomme slick con spalla arrotondata =====
  const buildWheel = (isFront, side) => {
    const wheelGroup = new THREE.Group();
    const spin = new THREE.Group();
    wheelGroup.add(spin);
    const width = isFront ? 0.0105 : 0.0135;
    const R = wheelRadius;
    const rimR = 0.0085;
    const sh = 0.0016;
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
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const tireGeo = new THREE.LatheGeometry(tirePts, 40);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, rubber);
    tire.castShadow = true;
    spin.add(tire);

    const outer = side; // la faccia esterna del cerchio guarda verso l'esterno dell'auto
    const rimPts = [
      [rimR * 0.98, -hw * 0.95],
      [rimR + 0.0003, -hw * 0.95],
      [rimR + 0.0003, hw * 0.95],
      [rimR * 0.98, hw * 0.95],
      [rimR * 0.9, hw * 0.6]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const rimGeo = new THREE.LatheGeometry(rimPts, 32);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spin.add(rim);

    const spokeGeos = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sg = new THREE.BoxGeometry(0.0012, rimR * 0.86, 0.0011);
      sg.translate(0, rimR * 0.5, 0);
      sg.rotateX(a);
      sg.translate(outer * hw * 0.45, 0, 0);
      spokeGeos.push(sg);
    }
    const hub = new THREE.CylinderGeometry(0.0026, 0.0026, width * 0.9, 16);
    hub.rotateZ(Math.PI / 2);
    spokeGeos.push(hub);
    const spokes = new THREE.Mesh(mergeGeometries(spokeGeos.map((g) => (g.index ? g.toNonIndexed() : g))), rimMat);
    spin.add(spokes);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.0022, 6), steel);
    nut.rotation.z = Math.PI / 2;
    nut.position.x = outer * (hw + 0.0006);
    spin.add(nut);

    if (isFront) {
      // Fusello dello sterzo (non ruota con la ruota, sterza con lei)
      const knuckle = new THREE.Mesh(new RoundedBoxGeometry(0.0042, 0.0105, 0.0075, 2, 0.0008), blackPlastic);
      knuckle.position.set(-side * (hw + 0.0024), 0, 0);
      wheelGroup.add(knuckle);
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.0034, 0.0022, 0.0075, 2, 0.0006), blackPlastic);
      arm.position.set(-side * (hw + 0.0045), -0.0007, -0.0062);
      wheelGroup.add(arm);
    } else {
      // Mozzo posteriore con cuscinetto
      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.002, 16), steel);
      bearing.rotation.z = Math.PI / 2;
      bearing.position.x = -side * (hw + 0.001);
      wheelGroup.add(bearing);
    }
    wheelGroup.userData.spin = spin;
    return wheelGroup;
  };

  const wheels = {
    lf: buildWheel(true, 1),
    rf: buildWheel(true, -1),
    lr: buildWheel(false, 1),
    rr: buildWheel(false, -1)
  };
  wheels.lf.position.set(halfTrack, wheelRadius, halfWb);
  wheels.rf.position.set(-halfTrack, wheelRadius, halfWb);
  wheels.lr.position.set(halfTrack + 0.0015, wheelRadius, -halfWb);
  wheels.rr.position.set(-halfTrack - 0.0015, wheelRadius, -halfWb);
  Object.values(wheels).forEach((w) => root.add(w));

  // ===== 7. Unisce i pezzi statici per materiale: tanti dettagli, pochissime chiamate grafiche =====
  root.updateMatrixWorld(true);
  const groups = new Map();
  for (const m of staticParts) {
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(m);
  }
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const key of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
      }
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    meshes.forEach((m) => root.remove(m));
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  return { group: root, wheels, springMaterial: springMat, springMesh, motorCanMaterial: motorCanMat, motorCan };
}
