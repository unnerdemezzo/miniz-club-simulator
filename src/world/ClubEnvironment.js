import * as THREE from 'three';
import { TRACK_LAYOUTS } from '../data/tracks.js';
import { BOARD, DRIVERS, FLOOR, LANES, ROOM, ROST } from '../club/config.js';
import { canvasTex, clamp, normalFromHeight, rng, speckle } from '../club/util.js';
import { makeMaterials } from '../club/materials.js';
import { clubWallMaterial, ROOM_WALL_COLORS } from '../club/room-wall.js';
import * as B from '../club/banners.js';
import { makeClubDetails, createStationDisplays, printBoxFace } from '../club/club-details.js';
import { buildBenchEquipment, buildClubAmenities } from '../club/club-workshop.js';
import { makeWaterCooler } from '../club/water-cooler.js';
import { buildRaceControl } from '../club/race-control.js';
import { buildClosedRoomDoor, buildWoodWorkshopWall } from '../club/club-wall-details.js';
import { buildSlotBrandPosters, WOOD_SLOT_BRAND_POSTERS } from '../club/slot-brand-posters.js';
import { DRIVER_CAST } from '../club/character-cast.js';
import { makeRealisticPilot } from '../club/realistic-pilot.js';
import { makePerson } from '../club/people.js';
import { buildRoomMarshals } from '../club/room-marshals.js';
import { buildRoomGuests } from '../club/room-guests.js';
import { ROOM_LINK } from '../club/club-tracks.js';
import { makeCar } from '../club/car.js';

const R = rng(21);

export class ClubEnvironment {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.M = makeMaterials();

    this.clubGroup = new THREE.Group();
    this.clubGroup.name = 'Sala Kyosho Mini-Z RC Club';
    this.trackGroup = new THREE.Group();
    this.trackGroup.name = 'Tracciato Kyosho RCP';
    this.aiCarsGroup = new THREE.Group();
    this.aiCarsGroup.name = 'Avversari AI Mini-Z';

    this.scene.add(this.clubGroup);
    this.scene.add(this.trackGroup);
    this.scene.add(this.aiCarsGroup);

    // Coordinate reali del Palco Guida:
    // Pedana moquette verde pista a y = 0.00m, pavimento sala a FLOOR = -0.85m, pedana piloti a ROST.top = -0.40m,
    // occhi del pilota a y = ROST.top + 1.64 = +1.24m sopra il piano pista, z = ROST.z0 + 0.36 = 1.91m
    this.driverEyePos = new THREE.Vector3(2.45, ROST.top + 1.64, ROST.z0 + 0.36);

    this.podiumPilots = [];
    this.marshals = [];
    this.backgroundPeople = [];
    this.raceControl = null;
    this.monitor = null;
    this.stationDisplays = null;
    this.aiCars = [];

    this.bridgeScreenCanvas = null;
    this.bridgeScreenCtx = null;
    this.bridgeScreenTex = null;

    this.activeTrackSpec = null;
    this.curve = null;
    this.curveSamples = [];
    this.totalTrackLength = 18.0;
    this.lastBridgeSide = null;
    this.lapArmed = false;

    this.rcpTexture = this.createHighResRcpTexture();
    this.rcpNormalMap = this.createFoamNormalMap();
    this.greenCarpetTex = this.createGreenCarpetTexture();

    if (this.renderer) {
      this.setupEnvironmentMap(this.renderer);
    }

    this.buildDetailedClubRoom();
  }

  setupEnvironmentMap(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x1c1e24);
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.7, 3.9, 4.1) });
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), panelMat);
        p.position.set(-3.5 + i * 2.4, 3.2, -6.5 + j * 3.1);
        p.rotation.x = Math.PI / 2;
        envScene.add(p);
      }
    }
    const wallM = new THREE.MeshBasicMaterial({ color: 0x3b3832, side: THREE.BackSide });
    const box = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 13), wallM);
    box.position.set(2.5, 1.2, -1.8);
    envScene.add(box);
    const floorM = new THREE.MeshBasicMaterial({ color: 0x1d4d2b });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(16, 13), floorM);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(2.5, -0.8, -1.8);
    envScene.add(fl);
    this.scene.environment = pmrem.fromScene(envScene, 0.035).texture;
    pmrem.dispose();
  }

  // Texture moquette verde tecnica da competizione RC per il piano d'appoggio sotto la pista
  createGreenCarpetTexture() {
    return canvasTex(1024, 512, (g, w, h) => {
      const r = rng(77);
      g.fillStyle = '#1f6b3b';
      g.fillRect(0, 0, w, h);

      // Trama moquette tecnica verde
      for (let i = 0; i < 32000; i++) {
        const shade = (r() * 26) | 0;
        g.fillStyle = r() > 0.5 ? `rgba(${22 + shade},${98 + shade},${52 + shade},0.35)` : `rgba(14,68,35,0.28)`;
        g.fillRect((r() * w) | 0, (r() * h) | 0, 3, 2);
      }

      // Righe sottili di taglio moquette ogni metro
      g.strokeStyle = 'rgba(15, 52, 28, 0.35)';
      g.lineWidth = 2;
      for (let x = 0; x < w; x += 128) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }

      // Cornice perimetrale bianca/rossa stile Paddock Mini-Z Cup sul tappeto verde
      g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      g.lineWidth = 6;
      g.strokeRect(14, 14, w - 28, h - 28);

      g.fillStyle = 'rgba(255, 255, 255, 0.16)';
      g.font = 'italic 900 30px "Titillium Web", sans-serif';
      g.fillText('KYOSHO MINI-Z CUP · OFFICIAL PADDOCK TURF', 38, h - 32);
      g.fillText('SCALE 1:27 RC RACING ARENA', w - 430, 52);
    }, { clamp: true });
  }

  // Texture grigio gomma EVA reale delle mattonelle Kyosho RCP Track (50x50cm con denti a puzzle)
  createHighResRcpTexture() {
    return canvasTex(512, 512, (g, w, h) => {
      const r = rng(202);
      // Vero colore grigio medio-antracite delle mattonelle in gomma Kyosho RCP
      g.fillStyle = '#434852';
      g.fillRect(0, 0, w, h);

      for (let i = 0; i < 20000; i++) {
        const v = 54 + ((r() * 26) | 0);
        g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.38)`;
        g.fillRect((r() * w) | 0, (r() * h) | 0, 2, 2);
      }

      // Giunzioni mattonelle 50x50cm con incastri a puzzle tipici Kyosho RCP
      g.strokeStyle = 'rgba(26, 29, 35, 0.65)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, w, h);
      g.strokeRect(w / 2, 0, w / 2, h / 2);
      g.strokeRect(0, h / 2, w / 2, h / 2);

      // Denti d'incastro lungo i bordi della mattonella
      g.fillStyle = 'rgba(32, 35, 42, 0.55)';
      for (let t = 32; t < w; t += 64) {
        g.fillRect(t, -2, 24, 8);
        g.fillRect(t, h / 2 - 4, 24, 8);
        g.fillRect(-2, t, 8, 24);
        g.fillRect(w / 2 - 4, t, 8, 24);
      }
    }, { repeat: [18, 12] });
  }

  createFoamNormalMap() {
    return normalFromHeight(256, 256, (g, w, h) => {
      const r = rng(101);
      g.fillStyle = '#808080';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14000; i++) {
        const v = 110 + ((r() * 36) | 0);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect((r() * w) | 0, (r() * h) | 0, 2, 2);
      }
      g.strokeStyle = 'rgba(40,40,40,0.45)';
      g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
    }, 1.8, [22, 22]);
  }

  buildDetailedClubRoom() {
    const M = this.M;
    const root = this.clubGroup;
    const posterLoader = new THREE.TextureLoader();
    const details = makeClubDetails(LANES);

    const add = (geo, mat, x, y, z, o = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (o.ry) m.rotation.y = o.ry;
      if (o.rx) m.rotation.x = o.rx;
      if (o.rz) m.rotation.z = o.rz;
      m.castShadow = o.cast !== false;
      m.receiveShadow = true;
      (o.parent || root).add(m);
      return m;
    };
    const box = (w, h, d, mat, x, y, z, o) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
    const cyl = (rt, rb, h, mat, x, y, z, o = {}) => add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 20), mat, x, y, z, o);
    const plane = (w, h, mat, x, y, z, o) => add(new THREE.PlaneGeometry(w, h), mat, x, y, z, Object.assign({ cast: false }, o));

    const RX0 = ROOM.x0, RX1 = ROOM.x1, RZ0 = ROOM.z0, RZ1 = ROOM.z1, CEIL = FLOOR + ROOM.h;
    const RW = RX1 - RX0, RD = RZ1 - RZ0, RCX = (RX0 + RX1) / 2, RCZ = (RZ0 + RZ1) / 2;
    const BX = (BOARD.x0 + BOARD.x1) / 2, BZ = (BOARD.z0 + BOARD.z1) / 2, BW = BOARD.x1 - BOARD.x0, BD = BOARD.z1 - BOARD.z0;

    // 1. PIANO D'APPOGGIO VERDE IN MOQUETTE TECNICA RC (visibile attorno a tutto il tracciato grigio Kyosho RCP!)
    const greenTopMat = new THREE.MeshStandardMaterial({
      map: this.greenCarpetTex,
      roughness: 0.88,
      metalness: 0.02
    });
    const baseSideMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.55,
      metalness: 0.25
    });
    // Pedana con faccia superiore VERDE (indice materiale 2 del BoxGeometry = +Y!)
    const platformMats = [baseSideMat, baseSideMat, greenTopMat, baseSideMat, baseSideMat, baseSideMat];
    box(BW, 0.06, BD, platformMats, BX, -0.03, BZ);

    // Base di supporto moderna scura sotto la pedana verde con striscia LED rossa Kyosho e pannelli sponsor RC
    const underPlatformMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.6, metalness: 0.2 });
    box(BW - 0.16, Math.abs(FLOOR) - 0.06, BD - 0.16, underPlatformMat, BX, (FLOOR - 0.06) / 2, BZ);

    // Cordolo/fascia perimetrale racing con pannelli sponsor Kyosho / PN Racing / Atomic / GL Racing
    const fasciaM = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.45 });
    const ledRedMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
    const fT = 0.028;
    const outline = [
      { x: BOARD.x0, z: BOARD.z0 },
      { x: BOARD.x1, z: BOARD.z0 },
      { x: BOARD.x1, z: BOARD.z1 },
      { x: BOARD.x0, z: BOARD.z1 }
    ];
    const borders = outline.map((p, i) => {
      const q = outline[(i + 1) % outline.length], dx = q.x - p.x, dz = q.z - p.z;
      return [Math.hypot(dx, dz), (p.x + q.x) / 2, (p.z + q.z) / 2, Math.atan2(-dz, dx)];
    });
    for (const [w, x, z, ry] of borders) {
      box(w + fT, 0.15, fT, fasciaM, x, -0.065, z, { ry });
      // Striscia LED rossa sul profilo della pedana verde
      box(w + fT + 0.004, 0.008, fT + 0.004, ledRedMat, x, -0.002, z, { ry, cast: false });
      const n = Math.floor(w / 1.3), nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
      for (let i = 0; i < n; i++) {
        const b = B.BRANDS[Math.abs(i + Math.round(ry * 2)) % B.BRANDS.length];
        const off = (i - (n - 1) / 2) * 1.3;
        plane(
          1.1,
          0.12,
          new THREE.MeshStandardMaterial({ map: B.brandBoard(b, 1024, 128), roughness: 0.45 }),
          x + tx * off + nx * 0.016,
          -0.072,
          z + tz * off + nz * 0.016,
          { ry }
        );
      }
    }

    // 2. Sala: pavimento, pareti, porte, controsoffitto LED
    plane(RW, RD, M.floor, RCX, FLOOR, RCZ, { rx: -Math.PI / 2 });
    const passage = ROOM_LINK;
    const wallParts = [
      [RW, RCX, RZ0, 0],
      [RW, RCX, RZ1, Math.PI],
      [passage.z0 - RZ0, RX0, (RZ0 + passage.z0) / 2, Math.PI / 2],
      [RZ1 - passage.z1, RX0, (passage.z1 + RZ1) / 2, Math.PI / 2],
      [passage.z0 - RZ0, RX1, (RZ0 + passage.z0) / 2, -Math.PI / 2],
      [RZ1 - passage.z1, RX1, (passage.z1 + RZ1) / 2, -Math.PI / 2]
    ];
    for (const [len, x, z, ry] of wallParts) {
      plane(len, ROOM.h, clubWallMaterial(M, len), x, FLOOR + ROOM.h / 2, z, { ry });
      const nx = Math.sin(ry), nz = Math.cos(ry);
      box(len, 0.05, 0.03, new THREE.MeshStandardMaterial({ color: ROOM_WALL_COLORS.rail, roughness: 0.35 }), x + nx * 0.015, FLOOR + 1.07, z + nz * 0.015, { ry, cast: false });
      box(len, 0.11, 0.02, new THREE.MeshStandardMaterial({ color: ROOM_WALL_COLORS.skirting, roughness: 0.4 }), x + nx * 0.01, FLOOR + 0.055, z + nz * 0.01, { ry, cast: false });
    }
    plane(passage.z1 - passage.z0, ROOM.h - passage.height, new THREE.MeshStandardMaterial({ color: ROOM_WALL_COLORS.upper, roughness: 0.92 }), RX1, FLOOR + passage.height + (ROOM.h - passage.height) / 2, (passage.z0 + passage.z1) / 2, { ry: -Math.PI / 2 });
    plane(passage.z1 - passage.z0, ROOM.h - passage.height, new THREE.MeshStandardMaterial({ color: ROOM_WALL_COLORS.upper, roughness: 0.92 }), RX0, FLOOR + passage.height + (ROOM.h - passage.height) / 2, (passage.z0 + passage.z1) / 2, { ry: Math.PI / 2 });

    const roomSign = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#17202a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3d234'; g.font = `900 72px ${B.FONT}`; g.textAlign = 'center';
      g.fillText('SALA DRIFT AWD →', w / 2, 92);
    }, { clamp: true });
    plane(2.25, 0.23, new THREE.MeshStandardMaterial({ map: roomSign, roughness: 0.7 }), RX1 - 0.012, FLOOR + 2.72, 2.8, { ry: -Math.PI / 2 });

    const rallySign = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#17202a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3d234'; g.font = `900 72px ${B.FONT}`; g.textAlign = 'center';
      g.fillText('← PADDOCK & TORNIO GOMME', w / 2, 92);
    }, { clamp: true });
    plane(2.25, 0.23, new THREE.MeshStandardMaterial({ map: rallySign, roughness: 0.7 }), RX0 + 0.02, FLOOR + 2.72, 2.8, { ry: Math.PI / 2 });

    buildClosedRoomDoor(root, { x: RX1, angle: -Math.PI / 2, to: 'Sala Drift' });
    buildClosedRoomDoor(root, { x: RX0, angle: Math.PI / 2, to: 'Officina' });
    // Cartelloni posizionati sulla parete posteriore (ROOM.z1) e parete destra, MAI sovrapposti sopra la direzione gara!
    buildSlotBrandPosters(root, posterLoader, WOOD_SLOT_BRAND_POSTERS);

    // Controsoffitto a quadrotte 60x60 con 24 plafoniere LED
    const ceilT = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#c9cac8'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 5000, ['rgba(0,0,0,.18)'], 1.1, R);
      g.strokeStyle = '#8f9295'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
    }, { repeat: [RW / 0.6, RD / 0.6] });
    plane(RW, RD, new THREE.MeshStandardMaterial({ map: ceilT, roughness: 1 }), RCX, CEIL, RCZ, { rx: Math.PI / 2 });

    const panelM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.7, 3.9, 4.1) });
    const frameM = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const x = -2.4 + i * 1.95, z = -5.4 + j * 2.0;
        box(1.24, 0.03, 0.64, frameM, x, CEIL - 0.015, z, { cast: false });
        plane(1.18, 0.58, panelM, x, CEIL - 0.031, z, { rx: Math.PI / 2 });
      }
    }

    // 3. Parete di fondo (RZ0): Striscione unico pulito, Maxischermo Live Timing IC-Tag, 4 poster ben distanziati, Orologio
    plane(5.2, 0.68, new THREE.MeshStandardMaterial({ map: B.mainBanner(), roughness: 0.75 }), 2.45, FLOOR + 2.74, RZ0 + 0.02);
    box(2.10, 1.18, 0.08, new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.25, metalness: 0.3 }), 2.45, FLOOR + 1.80, RZ0 + 0.06);
    const monCanvas = document.createElement('canvas');
    monCanvas.width = 1280;
    monCanvas.height = 720;
    const monTex = new THREE.CanvasTexture(monCanvas);
    monTex.colorSpace = THREE.SRGBColorSpace;
    monTex.anisotropy = 8;
    const screenM = new THREE.MeshBasicMaterial({ map: monTex, color: new THREE.Color(1.25, 1.25, 1.25) });
    plane(1.98, 1.08, screenM, 2.45, FLOOR + 1.80, RZ0 + 0.102);
    this.monitor = { canvas: monCanvas, tex: monTex };

    const posters = [
      [B.posterCalendar(), -2.9],
      [B.posterStandings(), -1.9],
      [B.posterRules(), 6.8],
      [B.posterOpenDay(), 7.8]
    ];
    for (const [t, x] of posters) {
      box(0.66, 0.91, 0.02, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.4 }), x, FLOOR + 1.8, RZ0 + 0.012, { cast: false });
      plane(0.62, 0.87, new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.2, clearcoat: 0.6 }), x, FLOOR + 1.8, RZ0 + 0.024);
    }
    add(new THREE.CircleGeometry(0.19, 48), new THREE.MeshStandardMaterial({ map: B.clockTex(), roughness: 0.3 }), 9.1, FLOOR + 2.25, RZ0 + 0.03, { cast: false });
    cyl(0.2, 0.2, 0.04, M.darkMetal, 9.1, FLOOR + 2.25, RZ0 + 0.015, { rx: Math.PI / 2, seg: 48 });

    // 4. ELEMENTO ORIGINALE MINI-Z: Vetrina Illuminata "Kyosho AutoScale Collection" con carrozzerie in teca LED!
    this.buildAutoScaleShowcase(root, 0.35, FLOOR, RZ0 + 0.28);

    // 5. ELEMENTO ORIGINALE MINI-Z: Podio Premiazione 1° / 2° / 3° Posto "Mini-Z Cup" nell'angolo destro
    this.buildWinnersPodium(root, 5.15, FLOOR, RZ0 + 0.45);

    // 6. Parete attrezzata officina sulla sinistra + 3 Banchi Box RC
    buildWoodWorkshopWall(root);

    const exM = new THREE.MeshPhysicalMaterial({ color: 0xc0121a, roughness: 0.3, clearcoat: 1 });
    cyl(0.085, 0.085, 0.52, exM, RX1 - 0.14, FLOOR + 0.36, 0.65);
    cyl(0.03, 0.035, 0.09, M.blackPlastic, RX1 - 0.14, FLOOR + 0.66, 0.65);
    const signT = canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = '#c0121a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = `900 22px ${B.FONT}`; g.textAlign = 'center';
      g.fillText('ESTINTORE', w / 2, h - 18);
      g.beginPath(); g.moveTo(40, 110); g.lineTo(88, 110); g.lineTo(80, 40); g.lineTo(48, 40); g.fill();
    }, { clamp: true });
    plane(0.2, 0.25, new THREE.MeshStandardMaterial({ map: signT, roughness: 0.5 }), RX1 - 0.005, FLOOR + 1.3, 0.65, { ry: -Math.PI / 2 });

    // Bacheca trofei
    const wd = M.woodDark;
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8ac3c, metalness: 1, roughness: 0.18 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xd0d5da, metalness: 1, roughness: 0.15 });
    const tx = RX1 - 0.26, tz = -4.2;
    box(0.42, 0.06, 1.6, wd, tx, FLOOR + 0.03, tz);
    box(0.42, 0.06, 1.6, wd, tx, FLOOR + 1.96, tz);
    box(0.04, 1.96, 1.6, wd, RX1 - 0.04, FLOOR + 0.98, tz);
    for (const dz of [-0.78, 0.78]) box(0.42, 1.96, 0.04, wd, tx, FLOOR + 0.98, tz + dz);

    const cupGeo = new THREE.LatheGeometry(
      [[0, 0], [0.05, 0], [0.05, 0.012], [0.012, 0.03], [0.01, 0.09], [0.03, 0.1], [0.075, 0.16], [0.08, 0.22], [0.072, 0.22], [0.066, 0.17], [0, 0.15]].map(p => new THREE.Vector2(p[0], p[1])),
      32
    );
    for (const y of [0.52, 0.98, 1.44]) {
      box(0.36, 0.015, 1.5, new THREE.MeshPhysicalMaterial({ color: 0xdfeaf0, transmission: 0.9, roughness: 0.05, thickness: 0.01, transparent: true, opacity: 0.6 }), tx, FLOOR + y, tz, { cast: false });
      for (let k = 0; k < 4; k++) {
        const s = 0.8 + ((k * 7 + y * 10) % 5) * 0.12;
        const cup = add(cupGeo, (k + Math.round(y * 10)) % 3 ? gold : silver, tx - 0.03, FLOOR + y + 0.008, tz - 0.54 + k * 0.36);
        cup.scale.setScalar(s);
      }
    }
    plane(1.5, 1.86, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.004, transparent: true, opacity: 0.25 }), RX1 - 0.47, FLOOR + 0.98, tz, { ry: -Math.PI / 2 });

    const corkT = canvasTex(512, 320, (g, w, h) => {
      g.fillStyle = '#b4875a'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 20000, ['#8c6238', '#caa27a', '#7a5430'], 1.6, R);
      const notes = [['#fff', 'ISCRIZIONI MINI-Z CUP'], ['#ffe98a', 'Turni pulizia RCP'], ['#fff', 'Vendo motori 8500KV'], ['#bfe3ff', 'Setup molle MR-04'], ['#fff', 'Quote sociali 2026']];
      notes.forEach((n, i) => {
        const x = 20 + (i % 3) * 165, y = 20 + Math.floor(i / 3) * 150;
        g.save(); g.translate(x + 70, y + 60); g.rotate((R() - 0.5) * 0.12);
        g.fillStyle = n[0]; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.fillRect(-70, -60, 140, 120); g.shadowBlur = 0;
        g.fillStyle = '#222'; g.font = `700 14px ${B.FONT}`; g.fillText(n[1], -62, -30);
        for (let l = 0; l < 5; l++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-60, -12 + l * 14, 90 + R() * 20, 3); }
        g.fillStyle = '#c8141b'; g.beginPath(); g.arc(0, -52, 6, 0, 7); g.fill();
        g.restore();
      });
    }, { clamp: true });
    box(0.04, 0.9, 1.44, new THREE.MeshStandardMaterial({ color: 0x5a3d25, roughness: 0.5 }), RX1 - 0.03, FLOOR + 1.6, -1.2, { cast: false });
    plane(1.36, 0.82, new THREE.MeshStandardMaterial({ map: corkT, roughness: 0.95 }), RX1 - 0.065, FLOOR + 1.6, -1.2, { ry: -Math.PI / 2 });

    // Banchi Box RC
    const benchTop = new THREE.MeshStandardMaterial({ map: M.wood.map, roughness: 0.5 });
    const matM = new THREE.MeshStandardMaterial({ map: details.benchMat, roughness: 0.95 });
    const boxCols = [0xc8141b, 0x1f4fd1, 0xf2c230, 0x222222, 0xeeeeee, 0x0f7a36];
    for (const bz of [-5.4, -2.6, 0.2]) {
      const bx = RX0 + 0.55;
      box(0.86, 0.05, 2.0, benchTop, bx, FLOOR + 0.9, bz);
      for (const dx of [-0.38, 0.38]) for (const dz of [-0.95, 0.95]) box(0.04, 0.88, 0.04, M.darkMetal, bx + dx, FLOOR + 0.44, bz + dz);
      box(0.8, 0.02, 1.9, M.darkMetal, bx, FLOOR + 0.2, bz);
      for (let k = 0; k < 4; k++) {
        box(0.22, 0.12, 0.3, new THREE.MeshStandardMaterial({ color: boxCols[(k + Math.abs(Math.round(bz))) % 6], roughness: 0.6 }), bx - 0.15, FLOOR + 0.27, bz - 0.7 + k * 0.45);
      }
      printBoxFace(box(0.5, 0.004, 0.7, matM, bx + 0.05, FLOOR + 0.927, bz - 0.2), 2);
      buildBenchEquipment(root, M, {
        x: bx,
        y: FLOOR + 0.927,
        z: bz - 0.15,
        room: 'Legno',
        car: true,
        worker: bz === -5.4 ? { x: 0.8, z: 0.45, rotation: Math.PI / 2, stool: false } : null
      });
      cyl(0.17, 0.17, 0.05, new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 }), bx + 0.8, FLOOR + (bz === -5.4 ? 0.61 : 0.66), bz + 0.3, { seg: 28 });
      cyl(0.025, 0.025, 0.62, M.metal, bx + 0.8, FLOOR + 0.32, bz + 0.3);
      cyl(0.22, 0.22, 0.02, M.darkMetal, bx + 0.8, FLOOR + 0.01, bz + 0.3, { seg: 28 });
    }
    buildClubAmenities(root, M, 'Legno');

    // Scaffale con le scatole Kyosho Readyset Mini-Z
    const shelfX = RX1 - 0.2;
    const boxLabelMats = details.boxLabels.map(map => new THREE.MeshStandardMaterial({ map, roughness: 0.82 }));
    for (let lv = 0; lv < 5; lv++) {
      box(0.36, 0.02, 2.0, M.woodDark, shelfX, FLOOR + 0.3 + lv * 0.4, -7.1, { cast: false });
      for (let k = 0; k < 7; k++) {
        const col = boxCols[(k * 3 + lv) % 6];
        printBoxFace(
          box(0.2, 0.08, 0.26, boxLabelMats[(k + lv) % 4], shelfX, FLOOR + 0.35 + lv * 0.4, -7.95 + k * 0.28),
          1,
          [(boxCols.indexOf(col) + 0.5) / 6, 0.125],
          [0, 0.25, 1, 0.75]
        );
      }
    }
    for (const dz of [-1.0, 1.0]) box(0.36, 2.0, 0.03, M.woodDark, shelfX, FLOOR + 1.0, -7.1 + dz);

    // 7. Postazione Direzione Gara con Direttore di Gara 3D + distributore d'acqua
    this.raceControl = buildRaceControl(root, M, 'wood', this.monitor, details, posterLoader);
    if (this.raceControl.director) {
      this.backgroundPeople.push(this.raceControl.director);
    }
    const cooler = makeWaterCooler();
    cooler.position.set(RX1 - 0.31, FLOOR, 1.15);
    cooler.rotation.y = -Math.PI / 2;
    root.add(cooler);

    // 8. Palco Guida Piloti (ROST: top = -0.40m, +45 cm sopra il pavimento)
    box(ROST.x1 - ROST.x0, ROST.top - FLOOR, ROST.z1 - ROST.z0, M.woodDark, (ROST.x0 + ROST.x1) / 2, (ROST.top + FLOOR) / 2, (ROST.z0 + ROST.z1) / 2);
    box(ROST.x1 - ROST.x0 - 0.02, 0.012, ROST.z1 - ROST.z0 - 0.02, M.carpet, (ROST.x0 + ROST.x1) / 2, ROST.top + 0.006, (ROST.z0 + ROST.z1) / 2);
    for (let i = 0; i < 3; i++) {
      box(0.34, ((ROST.top - FLOOR) * (i + 1)) / 3, ROST.z1 - ROST.z0, M.woodDark, ROST.x1 + 0.5 - i * 0.33, FLOOR + ((ROST.top - FLOOR) * (i + 1)) / 6, (ROST.z0 + ROST.z1) / 2);
    }

    const railY = ROST.top + 1.0, railZ = ROST.z0 + 0.08;
    const railM = new THREE.MeshStandardMaterial({ color: 0xb9bec5, metalness: 1, roughness: 0.28 });
    cyl(0.022, 0.022, ROST.x1 - ROST.x0, railM, (ROST.x0 + ROST.x1) / 2, railY + 0.04, railZ, { rz: Math.PI / 2, seg: 24 });
    box(ROST.x1 - ROST.x0, 0.03, 0.2, M.woodDark, (ROST.x0 + ROST.x1) / 2, railY, railZ);
    for (let x = ROST.x0 + 0.08; x <= ROST.x1; x += 1.05) {
      cyl(0.02, 0.02, 1.0, railM, x, ROST.top + 0.5, railZ);
    }

    this.stationDisplays = createStationDisplays(LANES);
    const stationScreenM = new THREE.MeshBasicMaterial({ map: this.stationDisplays.tex });
    LANES.forEach((L, i) => {
      const x = ROST.x0 + 0.85 + i * 1.45;
      printBoxFace(box(0.2, 0.012, 0.12, new THREE.MeshStandardMaterial({ map: details.stationLabels[i], roughness: 0.65 }), x, railY + 0.021, railZ), 2, [0.01, 0.5]);
      box(0.1, 0.07, 0.07, M.blackPlastic, x + 0.14, railY + 0.05, railZ);
      cyl(0.012, 0.012, 0.012, M.metal, x + 0.14, railY + 0.05, railZ + 0.04, { rx: Math.PI / 2 });
      box(0.16, 0.08, 0.03, M.blackPlastic, x - 0.12, railY + 0.07, railZ + 0.055);
      const geometry = new THREE.PlaneGeometry(0.12, 0.06), uv = geometry.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + i) / LANES.length);
      add(geometry, stationScreenM, x - 0.12, railY + 0.07, railZ + 0.071, { cast: false });
    });

    // 9. Piloti 3D realistici sul podio + Commissari rivolti verso la pista + Spettatori
    const person = options => makeRealisticPilot({ ...options, fallback: () => makePerson(options) });
    this.podiumPilots = [];
    for (let i = 0; i < 4; i++) {
      const sx = ROST.x0 + 0.85 + i * 1.45;
      const p = person({
        ...DRIVER_CAST[i],
        shirt: [0xd9161d, 0xf5f6f8, 0x118243, 0x1658c9][i],
        print: i === 1 ? 'dark' : 'light',
        hair: [0x2a1a10, 0x6b4a2a, 0x111111, 0x8a5a2b][i],
        skin: [0xe8c4a8, 0xd9a987, 0xc58c67, 0xf0d0b8][i]
      });
      p.position.set(sx, ROST.top + 0.012, ROST.z0 + 0.42);
      p.rotation.y = 0;
      root.add(p);
      this.podiumPilots.push(p);
      this.backgroundPeople.push(p);
    }

    const clubCtx = {
      trackId: 'wood',
      marshals: this.marshals,
      backgroundPeople: this.backgroundPeople
    };
    buildRoomMarshals(root, clubCtx, M);
    buildRoomGuests(root, clubCtx, person);
  }

  // Vetrina espositiva illuminata "Kyosho AutoScale Collection" con modelli 1:27 sotto teca
  buildAutoScaleShowcase(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.35, metalness: 0.6 });
    const redAccent = new THREE.MeshStandardMaterial({ color: 0xc8141b, roughness: 0.3 });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2f1ff,
      transparent: true,
      opacity: 0.26,
      roughness: 0.05,
      transmission: 0.85
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.35, 0.44), frameMat);
    base.position.y = 0.175;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 0.44), redAccent);
    top.position.y = 1.92;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.50, 0.03), frameMat);
    back.position.set(0, 1.10, -0.20);
    g.add(base, top, back);

    const headerTex = canvasTex(512, 64, (ctx, w, h) => {
      ctx.fillStyle = '#c8141b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'italic 900 30px "Titillium Web", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('KYOSHO AUTOSCALE COLLECTION', w / 2, 43);
    }, { clamp: true });
    const headerPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.11), new THREE.MeshBasicMaterial({ map: headerTex }));
    headerPlane.position.set(0, 1.92, 0.222);
    g.add(headerPlane);

    const colors = [0xe11d48, 0xfacc15, 0x2563eb, 0x10b981, 0xf97316, 0xec4899];
    for (let s = 0; s < 3; s++) {
      const sy = 0.65 + s * 0.42;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.015, 0.38), glassMat);
      shelf.position.y = sy;
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.008, 0.02), ledMat);
      led.position.set(0, sy + 0.38, 0.15);
      g.add(shelf, led);

      for (let c = 0; c < 2; c++) {
        const cx = -0.28 + c * 0.56;
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.13), frameMat);
        plinth.position.set(cx, sy + 0.018, 0);
        const carShell = new THREE.Mesh(
          new THREE.BoxGeometry(0.17, 0.042, 0.078),
          new THREE.MeshPhysicalMaterial({ color: colors[(s * 2 + c) % colors.length], roughness: 0.18, clearcoat: 1 })
        );
        carShell.position.set(cx, sy + 0.048, 0);
        g.add(plinth, carShell);
      }
    }

    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.10, 1.48), glassMat);
    frontGlass.position.set(0, 1.10, 0.21);
    g.add(frontGlass);
    parent.add(g);
  }

  // Podio Premiazione 1° / 2° / 3° Posto "Mini-Z Cup"
  buildWinnersPodium(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const stepMat = new THREE.MeshStandardMaterial({ color: 0x181c26, roughness: 0.45, metalness: 0.3 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xc8141b, roughness: 0.6 });

    const steps = [
      { pos: '1', dx: 0, w: 0.46, h: 0.42, col: '#facc15' },
      { pos: '2', dx: -0.47, w: 0.44, h: 0.30, col: '#e2e8f0' },
      { pos: '3', dx: 0.47, w: 0.44, h: 0.22, col: '#d97706' }
    ];

    for (const st of steps) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, 0.42), stepMat);
      b.position.set(st.dx, st.h / 2, 0);
      b.castShadow = true;
      b.receiveShadow = true;
      const carpet = new THREE.Mesh(new THREE.BoxGeometry(st.w - 0.02, 0.012, 0.40), topMat);
      carpet.position.set(st.dx, st.h + 0.006, 0);

      const numTex = canvasTex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#11151f';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = st.col;
        ctx.font = '900 78px "Titillium Web", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.pos, w / 2, h / 2);
      }, { clamp: true });
      const numPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ map: numTex }));
      numPlane.position.set(st.dx, st.h / 2, 0.212);
      g.add(b, carpet, numPlane);
    }

    parent.add(g);
  }

  // Genera una curva chiusa smussata a 600 campioni con raggio minimo garantito (ZERO pieghe/auto-intersezioni sui cordoli!)
  buildZeroFoldSamples(waypoints, numSamples = 600, smoothIterations = 32) {
    const baseCurve = new THREE.CatmullRomCurve3(waypoints, true, 'centripetal', 0.5);
    let pts = [];
    for (let i = 0; i < numSamples; i++) {
      pts.push(baseCurve.getPointAt(i / numSamples));
    }

    for (let iter = 0; iter < smoothIterations; iter++) {
      const next = [];
      for (let i = 0; i < numSamples; i++) {
        const pPrev = pts[(i - 1 + numSamples) % numSamples];
        const pCur = pts[i];
        const pNext = pts[(i + 1) % numSamples];
        next.push(
          new THREE.Vector3(
            pCur.x * 0.5 + (pPrev.x + pNext.x) * 0.25,
            0,
            pCur.z * 0.5 + (pPrev.z + pNext.z) * 0.25
          )
        );
      }
      pts = next;
    }

    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.totalTrackLength = this.curve.getLength();

    const rawCurvatures = new Float32Array(numSamples);
    const samples = [];
    for (let i = 0; i < numSamples; i++) {
      const pPrev = pts[(i - 1 + numSamples) % numSamples];
      const pCur = pts[i];
      const pNext = pts[(i + 1) % numSamples];
      const tan = pNext.clone().sub(pPrev).normalize();
      const normal = new THREE.Vector3(-tan.z, 0, tan.x);

      const pAhead = pts[(i + 8) % numSamples];
      const pBehind = pts[(i - 8 + numSamples) % numSamples];
      const tanAhead = pAhead.clone().sub(pCur).normalize();
      const tanBehind = pCur.clone().sub(pBehind).normalize();
      rawCurvatures[i] = tanBehind.angleTo(tanAhead);

      samples.push({ t: i / numSamples, pt: pCur, tan, normal, cornerWeight: 0 });
    }

    // Smussa il peso curva (cornerWeight da 0 a 1) con finestra mobile per raccordi cordolo perfetti senza gradini!
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      const win = 10;
      for (let k = -win; k <= win; k++) {
        const idx = (i + k + numSamples) % numSamples;
        sum += rawCurvatures[idx] > 0.085 ? 1 : 0;
      }
      const ratio = sum / (win * 2 + 1);
      // Smoothstep
      samples[i].cornerWeight = ratio * ratio * (3 - 2 * ratio);
    }

    return samples;
  }

  buildTrack(trackId, reverse = false) {
    while (this.trackGroup.children.length > 0) {
      this.trackGroup.remove(this.trackGroup.children[0]);
    }

    const spec = TRACK_LAYOUTS.find((t) => t.id === trackId) || TRACK_LAYOUTS[0];
    this.activeTrackSpec = spec;

    const rawPoints = spec.waypoints.map((p) => new THREE.Vector3(p.x, 0, p.z));
    if (reverse) rawPoints.reverse();

    const numSamples = 600;
    this.curveSamples = this.buildZeroFoldSamples(rawPoints, numSamples, 32);

    const laneHalf = spec.laneWidth / 2;

    // 1. Pista in gomma grigia Kyosho RCP Track (appoggiata sul piano verde del tavolo/pedana!)
    const roadMesh = this.createSmoothRoadMesh(this.curveSamples, laneHalf, 0.008, spec.surfaceType);
    this.trackGroup.add(roadMesh);

    // 2. Cordoli raccordati e Sponde morbide continue Kyosho RCP (0 pieghe, giunzioni saldate!)
    this.buildContinuousWallsAndCurbs(this.curveSamples, laneHalf);

    // 3. Trova il punto perfettamente dritto sul rettilineo principale davanti al palco (x ≈ 2.6, z > 0)
    let bridgeIdx = 0;
    let bestBridgeScore = Infinity;
    for (let i = 0; i < numSamples; i++) {
      const s = this.curveSamples[i];
      if (s.pt.z > 0.05) {
        const score = Math.abs(s.pt.x - 2.65) + Math.abs(s.tan.z) * 4;
        if (score < bestBridgeScore) {
          bestBridgeScore = score;
          bridgeIdx = i;
        }
      }
    }
    const bridgeSample = this.curveSamples[bridgeIdx];
    this.buildTimingBridge(bridgeSample, spec.laneWidth);

    // 4. Crea / reimposta le 3 Auto Avversarie AI Mini-Z sul tracciato
    this.spawnAiCars();

    // 5. Posizione di partenza dell'auto sul rettilineo principale prima del ponte (100% dritta al centro corsia!)
    const startIdx = (bridgeIdx - 28 + numSamples) % numSamples;
    const startSample = this.curveSamples[startIdx];
    const startHeading = Math.atan2(startSample.tan.x, startSample.tan.z);

    this.lastBridgeSide = null;
    this.lapArmed = false;

    return {
      spec,
      startX: startSample.pt.x,
      startZ: startSample.pt.z,
      startHeading,
      gripMultiplier: spec.gripMultiplier,
      waypoints: spec.waypoints,
      tvCameras: spec.tvCameras,
      checkCollision: (x, z, carRadius) => this.checkCollision(x, z, carRadius, laneHalf),
      checkLapCrossing: (x, z) => this.checkLapCrossing(x, z, bridgeSample)
    };
  }

  spawnAiCars() {
    while (this.aiCarsGroup.children.length > 0) {
      this.aiCarsGroup.remove(this.aiCarsGroup.children[0]);
    }
    this.aiCars = [];

    for (let i = 1; i <= 3; i++) {
      const drv = DRIVERS[i];
      const carObj = makeCar(drv);
      carObj.root.scale.setScalar(1.16);
      this.aiCarsGroup.add(carObj.root);

      this.aiCars.push({
        driver: drv,
        carObj,
        t: (0.04 - i * 0.025 + 1) % 1,
        laneOffset: (i - 2) * 0.16,
        speed: 3.6 * (drv.pace || 1.0),
        laps: 1,
        lapTime: 0,
        bestLap: 6.45 + i * 0.12
      });
    }
  }

  // Superficie mattonelle Kyosho RCP in vero grigio gomma EVA opaco con giunzioni a puzzle
  createSmoothRoadMesh(samples, halfWidth, yOffset, surfaceType) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const n = samples.length;

    // Estende la base di gomma grigia fino a comprendere la sede dei cordoli
    const totalHalfWidth = halfWidth + 0.042;

    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const left = s.pt.clone().addScaledVector(s.normal, -totalHalfWidth);
      const right = s.pt.clone().addScaledVector(s.normal, totalHalfWidth);

      positions.push(left.x, yOffset, left.z);
      positions.push(right.x, yOffset, right.z);

      const v = (i / n) * 42;
      uvs.push(0, v, 1, v);

      if (i < n) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const r = rng(404);

    // Colore reale grigio mattonella in gomma espansa Kyosho RCP
    ctx.fillStyle = surfaceType === 'drift_carpet' ? '#2e3543' : '#424750';
    ctx.fillRect(0, 0, 512, 512);

    // Grana porosa tipica dell'EVA Kyosho RCP
    for (let i = 0; i < 16000; i++) {
      const v = 56 + ((r() * 24) | 0);
      ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.32)`;
      ctx.fillRect((r() * 512) | 0, (r() * 512) | 0, 2, 2);
    }

    // Leggera gommatura scura lasciata dalle gomme Mini-Z al centro della corsia
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.08)');
    grad.addColorStop(0.22, 'rgba(0,0,0,0.0)');
    grad.addColorStop(0.5, 'rgba(18,20,24,0.28)');
    grad.addColorStop(0.78, 'rgba(0,0,0,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Giunzioni trasversali e longitudinali a puzzle ogni 50cm delle mattonelle Kyosho RCP
    ctx.strokeStyle = 'rgba(24,27,32,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.colorSpace = THREE.SRGBColorSpace;
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.anisotropy = 8;

    const mat = new THREE.MeshStandardMaterial({
      map: roadTex,
      normalMap: this.rcpNormalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: surfaceType === 'drift_carpet' ? 0.45 : 0.82,
      metalness: 0.04
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  buildContinuousWallsAndCurbs(samples, halfWidth) {
    const curbWidth = 0.042;
    const wallWidth = 0.036;
    const wallHeight = 0.042;

    for (const side of [-1, 1]) {
      // Cordoli inclinati raccordati sul bordo della corsia (da halfWidth - curbWidth a halfWidth)
      const curbMesh = this.createSeamlessCurbRibbon(samples, side, halfWidth - curbWidth, halfWidth);
      this.trackGroup.add(curbMesh);

      // Sponda morbida continua Kyosho RCP (da halfWidth a halfWidth + wallWidth)
      const wallMesh = this.createExtrudedWallBand(
        samples,
        side * halfWidth,
        side * (halfWidth + wallWidth),
        wallHeight
      );
      this.trackGroup.add(wallMesh);
    }
  }

  // Cordoli continui con rampa dolce e giunzioni saldate (zero scalini, zero buchi, zero sovrapposizioni)
  createSeamlessCurbRibbon(samples, side, innerAbs, outerAbs) {
    const n = samples.length;
    const offsetIn = side * innerAbs;
    const offsetOut = side * outerAbs;
    const minOff = Math.min(offsetIn, offsetOut);
    const maxOff = Math.max(offsetIn, offsetOut);

    const positions = [];
    const colors = [];
    const indices = [];

    const cRed = new THREE.Color(0xd91b24);
    const cWhite = new THREE.Color(0xf1f5f9);
    const cGrey = new THREE.Color(0x3f444e);

    for (let i = 0; i < n; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % n];

      const w0 = s0.cornerWeight;
      const w1 = s1.cornerWeight;
      if (w0 < 0.02 && w1 < 0.02) continue;

      const stripe = Math.floor(i / 4) % 2 === 0;
      const targetCol = stripe ? cRed : cWhite;
      const col0 = cGrey.clone().lerp(targetCol, Math.min(1, w0 * 1.4));
      const col1 = cGrey.clone().lerp(targetCol, Math.min(1, w1 * 1.4));

      const yBase = 0.0085;
      const yPeak0 = yBase + 0.0075 * w0;
      const yPeak1 = yBase + 0.0075 * w1;

      const p0In = s0.pt.clone().addScaledVector(s0.normal, minOff);
      const p0Out = s0.pt.clone().addScaledVector(s0.normal, maxOff);
      const p1In = s1.pt.clone().addScaledVector(s1.normal, minOff);
      const p1Out = s1.pt.clone().addScaledVector(s1.normal, maxOff);

      // Profilo smussato: alto verso la sponda esterna, a filo pista verso l'interno della corsia
      const y0Min = side < 0 ? yPeak0 : yBase;
      const y0Max = side < 0 ? yBase : yPeak0;
      const y1Min = side < 0 ? yPeak1 : yBase;
      const y1Max = side < 0 ? yBase : yPeak1;

      const base = positions.length / 3;
      positions.push(
        p0In.x, y0Min, p0In.z,
        p0Out.x, y0Max, p0Out.z,
        p1Out.x, y1Max, p1Out.z,
        p1In.x, y1Min, p1In.z
      );
      colors.push(
        col0.r, col0.g, col0.b,
        col0.r, col0.g, col0.b,
        col1.r, col1.g, col1.b,
        col1.r, col1.g, col1.b
      );

      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.05,
        side: THREE.DoubleSide
      })
    );
  }

  createExtrudedWallBand(samples, offsetA, offsetB, height) {
    const minOff = Math.min(offsetA, offsetB);
    const maxOff = Math.max(offsetA, offsetB);
    const n = samples.length;

    const positions = [];
    const colors = [];
    const indices = [];

    const cRed = new THREE.Color(0xdc2626);
    const cWhite = new THREE.Color(0xf8fafc);
    const cDark = new THREE.Color(0x232730);

    for (let i = 0; i < n; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % n];

      const isCorner = s0.cornerWeight > 0.25;
      const bandIdx = Math.floor(i / 5);
      let col = cDark;
      if (isCorner) {
        col = bandIdx % 2 === 0 ? cRed : cWhite;
      } else if (bandIdx % 8 === 0) {
        col = cWhite;
      }

      const p0In = s0.pt.clone().addScaledVector(s0.normal, minOff);
      const p0Out = s0.pt.clone().addScaledVector(s0.normal, maxOff);
      const p1In = s1.pt.clone().addScaledVector(s1.normal, minOff);
      const p1Out = s1.pt.clone().addScaledVector(s1.normal, maxOff);

      const baseVert = positions.length / 3;
      const y0 = 0.008;
      const pts = [
        [p0In.x, y0, p0In.z],
        [p0Out.x, y0, p0Out.z],
        [p0Out.x, height, p0Out.z],
        [p0In.x, height, p0In.z],
        [p1In.x, y0, p1In.z],
        [p1Out.x, y0, p1Out.z],
        [p1Out.x, height, p1Out.z],
        [p1In.x, height, p1In.z]
      ];

      for (const p of pts) {
        positions.push(p[0], p[1], p[2]);
        colors.push(col.r, col.g, col.b);
      }

      indices.push(baseVert + 3, baseVert + 2, baseVert + 6, baseVert + 3, baseVert + 6, baseVert + 7);
      indices.push(baseVert + 0, baseVert + 3, baseVert + 7, baseVert + 0, baseVert + 7, baseVert + 4);
      indices.push(baseVert + 1, baseVert + 5, baseVert + 6, baseVert + 1, baseVert + 6, baseVert + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.08,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Ponte di Cronometraggio Kyosho IC-Tag pulito ad arco alto sopra il rettilineo (senza banner in mezzo alla pista!)
  buildTimingBridge(sample, laneWidth) {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(sample.pt.x, 0.008, sample.pt.z);
    // Allinea l'asse +Z locale lungo la direzione di marcia (sample.tan) e l'asse +X attraverso la larghezza della corsia
    bridgeGroup.rotation.y = Math.atan2(sample.tan.x, sample.tan.z);

    // Linea del traguardo a scacchi dipinta a filo tappeto RCP
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = 256;
    checkerCanvas.height = 64;
    const cctx = checkerCanvas.getContext('2d');
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 4; y++) {
        cctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111827';
        cctx.fillRect(x * 16, y * 16, 16, 16);
      }
    }
    const finishLine = new THREE.Mesh(
      new THREE.PlaneGeometry(laneWidth, 0.14),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(checkerCanvas) })
    );
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.y = 0.0015;
    bridgeGroup.add(finishLine);

    // Portale snello ad arco Kyosho IC-Tag / Robitronic posto all'esterno delle sponde
    const span = laneWidth + 0.14;
    const height = 0.34;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.35, metalness: 0.65 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc8141b, roughness: 0.35, metalness: 0.3 });

    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.028, height, 0.036), frameMat);
      pillar.position.set((s * span) / 2, height / 2, 0);
      pillar.castShadow = true;
      const baseFoot = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.012, 0.08), redMat);
      baseFoot.position.set((s * span) / 2, 0.006, 0);
      bridgeGroup.add(pillar, baseFoot);
    }

    // Traversa superiore sottile con sensori IR/IC-Tag e semaforo LED
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(span + 0.04, 0.048, 0.044), frameMat);
    crossbar.position.set(0, height + 0.012, 0);
    crossbar.castShadow = true;
    bridgeGroup.add(crossbar);

    // Semaforo LED sul ponte
    for (let i = -2; i <= 2; i++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 12, 12),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0x22c55e : 0xef4444 })
      );
      led.position.set(i * 0.08, height - 0.014, 0);
      bridgeGroup.add(led);
    }

    // Inizializza la telemetria del Maxischermo a parete
    this.updateBridgeDisplay(0, null, null);
    this.trackGroup.add(bridgeGroup);
  }

  updateBridgeDisplay(lapCount, lastLapSec, bestLapSec) {
    const fmt = (t) => (t ? `${t.toFixed(2)}s` : '--.--s');

    // Aggiorna il Maxischermo di fondo sala (1280x720)
    if (this.monitor?.canvas && this.monitor?.tex) {
      const g = this.monitor.canvas.getContext('2d');
      const w = 1280, h = 720;
      g.fillStyle = '#0d121c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8141b';
      g.fillRect(0, 0, w, 92);
      g.fillStyle = '#ffffff';
      g.font = `italic 900 48px ${B.FONT}`;
      g.fillText('MINI-Z RC CLUB · TELEMETRIA IC-TAG LIVE', 36, 62);

      const rows = [
        { pos: 1, name: '1. Tu (Ferrari 499P)', laps: lapCount, last: fmt(lastLapSec), best: fmt(bestLapSec), col: '#e4242b' },
        { pos: 2, name: '2. Marco R. (PN Racing)', laps: Math.max(1, lapCount), last: '6.62s', best: '6.48s', col: '#f4f4f6' },
        { pos: 3, name: '3. Sara B. (M-Power)', laps: Math.max(1, lapCount - 1), last: '6.79s', best: '6.61s', col: '#19a954' },
        { pos: 4, name: '4. Luca P. (GL Racing)', laps: Math.max(1, lapCount - 1), last: '6.71s', best: '6.55s', col: '#1f7ae8' }
      ];
      rows.forEach((r, idx) => {
        const y = 140 + idx * 130;
        g.fillStyle = idx % 2 === 0 ? '#161f30' : '#121926';
        g.fillRect(32, y, w - 64, 110);
        g.fillStyle = r.col;
        g.fillRect(32, y, 18, 110);
        g.fillStyle = '#ffffff';
        g.font = `800 40px ${B.FONT}`;
        g.fillText(r.name, 74, y + 68);
        g.fillStyle = '#facc15';
        g.fillText(`GIRI: ${r.laps}`, 620, y + 68);
        g.fillStyle = '#38bdf8';
        g.fillText(`ULT: ${r.last}`, 820, y + 68);
        g.fillStyle = '#22c55e';
        g.fillText(`BEST: ${r.best}`, 1040, y + 68);
      });
      this.monitor.tex.needsUpdate = true;
    }
  }

  checkCollision(x, z, carRadius, halfWidth) {
    let minDistSq = Infinity;
    let closest = this.curveSamples[0];

    for (let i = 0; i < this.curveSamples.length; i++) {
      const s = this.curveSamples[i];
      const dx = x - s.pt.x;
      const dz = z - s.pt.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closest = s;
      }
    }

    const dx = x - closest.pt.x;
    const dz = z - closest.pt.z;
    const lateralOffset = dx * closest.normal.x + dz * closest.normal.z;
    const maxOffset = halfWidth - carRadius;
    const onCurb = Math.abs(lateralOffset) > maxOffset - 0.045;

    if (Math.abs(lateralOffset) > maxOffset) {
      const sign = Math.sign(lateralOffset) || 1;
      const clampedLat = sign * maxOffset;
      const along = dx * closest.tan.x + dz * closest.tan.z;
      const correctedX = closest.pt.x + closest.tan.x * along + closest.normal.x * clampedLat;
      const correctedZ = closest.pt.z + closest.tan.z * along + closest.normal.z * clampedLat;
      return {
        hitWall: true,
        onCurb: true,
        correctedX,
        correctedZ,
        normalX: -sign * closest.normal.x,
        normalZ: -sign * closest.normal.z
      };
    }

    return { hitWall: false, onCurb };
  }

  checkLapCrossing(x, z, bridgeSample) {
    const dx = x - bridgeSample.pt.x;
    const dz = z - bridgeSample.pt.z;
    const distSq = dx * dx + dz * dz;

    if (distSq > 2.2) {
      this.lapArmed = true;
    }

    if (distSq < 0.45) {
      const forwardDot = dx * bridgeSample.tan.x + dz * bridgeSample.tan.z;
      const currentSide = forwardDot >= 0 ? 1 : -1;
      if (this.lastBridgeSide === -1 && currentSide === 1) {
        this.lastBridgeSide = currentSide;
        if (this.lapArmed) {
          this.lapArmed = false;
          return 'lap_completed';
        }
        return 'timer_started';
      }
      this.lastBridgeSide = currentSide;
    }
    return null;
  }

  getNearestTrackPose(x, z) {
    let minDistSq = Infinity;
    let best = this.curveSamples[0];
    for (const s of this.curveSamples) {
      const dSq = (x - s.pt.x) ** 2 + (z - s.pt.z) ** 2;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        best = s;
      }
    }
    return {
      x: best.pt.x,
      z: best.pt.z,
      heading: Math.atan2(best.tan.x, best.tan.z)
    };
  }

  animateCharacters(timeSec, _carPos, _isSpeaking, dt = 1 / 60, cameraPos = null, playerThrottle = 0) {
    if (this.podiumPilots[1] && cameraPos) {
      const d = cameraPos.distanceTo(this.driverEyePos);
      this.podiumPilots[1].visible = d > 0.55;
      this.podiumPilots[1].userData.setThrottle?.(playerThrottle);
    }

    for (let i = 0; i < this.podiumPilots.length; i++) {
      if (i === 1) continue;
      this.podiumPilots[i]?.userData.setThrottle?.(0.45 + 0.45 * Math.sin(timeSec * 3.2 + i * 1.7));
    }

    for (let i = 0; i < this.backgroundPeople.length; i++) {
      const person = this.backgroundPeople[i];
      if (!person || !person.visible) continue;
      const dist = cameraPos ? cameraPos.distanceTo(person.position) : 3.2;
      person.userData.animate?.(dt, 0, dist);
    }

    if (this.curve && this.aiCars.length > 0) {
      for (let i = 0; i < this.aiCars.length; i++) {
        const ai = this.aiCars[i];
        const tNext = (ai.t + 0.025) % 1;
        const tanNow = this.curve.getTangentAt(ai.t);
        const tanAhead = this.curve.getTangentAt(tNext);
        const curvature = tanNow.angleTo(tanAhead);
        const targetSpeed = clamp((4.4 - curvature * 6.5) * (ai.driver.pace || 1.0), 1.85, 4.5);
        ai.speed += (targetSpeed - ai.speed) * Math.min(1, dt * 6);

        const prevT = ai.t;
        ai.t = (ai.t + (ai.speed * dt) / Math.max(8, this.totalTrackLength)) % 1;
        ai.lapTime += dt;
        if (ai.t < prevT) {
          ai.laps++;
          if (ai.lapTime > 4.0) ai.bestLap = Math.min(ai.bestLap, ai.lapTime);
          ai.lapTime = 0;
        }

        const pt = this.curve.getPointAt(ai.t);
        const tan = this.curve.getTangentAt(ai.t).normalize();
        const normal = new THREE.Vector3(-tan.z, 0, tan.x);
        const worldPos = pt.clone().addScaledVector(normal, ai.laneOffset);

        ai.carObj.root.position.set(worldPos.x, 0.008, worldPos.z);
        ai.carObj.root.rotation.y = Math.atan2(-tan.z, tan.x);

        for (const w of ai.carObj.wheels) {
          w.g.rotation.z -= (ai.speed * dt) / w.r;
        }
      }
    }
  }
}
