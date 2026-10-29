import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TRACK_LAYOUTS } from '../data/tracks.js';
import { BOARD, DRIVERS, FLOOR, LANES, ROOM, ROST, TRACK_Y } from '../club/config.js';
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
import { resolveCarContacts, yawFromImpulse } from '../car/CarContacts.js';

// Ingombro in pianta per i contatti: Mini-Z 17,2 cm x 8 cm (avversari scalati 1,16 nel modello 3D)
const CAR_HALF_SEG = 0.05;
const CAR_RADIUS = 0.04;
// Griglia di partenza: file sfalsate a due a due, 30 cm tra una posizione e la successiva
const GRID_ROW_GAP = 0.3;
const GRID_LATERAL = 0.15;

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
    // Tutto il piano pista (tavolo, tracciato, scenografia, avversari) è abbassato di TRACK_Y
    this.trackGroup.position.y = TRACK_Y;
    this.aiCarsGroup.position.y = TRACK_Y;
    this.aiLevel = 'club';

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
    this.aiPaused = false;
    this.gridStartT = null;
    this.lapLineT = null;
    this.playerBody = null;

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

  // Riflessi come in Slot-Car (js/main.js): copia semplificata della sala con plafoniere molto luminose, pareti e
  // pavimento grigi neutri e lo striscione rosso, centrata sul tavolo. È anche la luce ambiente della scena.
  setupEnvironmentMap(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(16, 3.3, 13), new THREE.MeshBasicMaterial({ color: 0x3a3b3d, side: THREE.BackSide }));
    es.add(room);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(16, 13), new THREE.MeshBasicMaterial({ color: 0x46484b }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.y = -1.6;
    es.add(fl);
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.8, 8.4) });
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.58), lm);
        l.rotation.x = Math.PI / 2;
        l.position.set(-5 + i * 1.95, 1.63, -3 + j * 2);
        es.add(l);
      }
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.6), new THREE.MeshBasicMaterial({ color: 0x8a1016 }));
    banner.position.set(0, 1.0, -6.45);
    es.add(banner);
    this.scene.environment = pmrem.fromScene(es, 0.02).texture;
    pmrem.dispose();
  }

  // Moquette agugliata del piano tavolo fuori pista: grigio medio caldo (tortora), ben distinto sia dalla gomma
  // antracite delle mattonelle RCP sia dal cemento grigio freddo del pavimento della sala (#8a8c8e)
  createGreenCarpetTexture() {
    return canvasTex(512, 512, (g, w, h) => {
      const r = rng(77);
      g.fillStyle = '#6a665f';
      g.fillRect(0, 0, w, h);

      // Fibre corte incrociate a bassissimo contrasto
      for (let i = 0; i < 55000; i++) {
        const v = (r() - 0.5) * 18;
        g.fillStyle = `rgba(${106 + v},${102 + v},${95 + v},0.52)`;
        const x = r() * w, y = r() * h, a = r() * Math.PI;
        g.fillRect(x, y, 1 + Math.abs(Math.cos(a)) * 2, 1 + Math.abs(Math.sin(a)) * 2);
      }
      // Macchie di usura/polvere molto lievi
      for (let i = 0; i < 36; i++) {
        const x = r() * w, y = r() * h, rad = 20 + r() * 60;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.03)`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }, { repeat: [BOARD.x1 - BOARD.x0, BOARD.z1 - BOARD.z0] });
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

    // 1. TAVOLO PISTA: piano in moquette agugliata grigio tortora (come nei club veri), abbassato di TRACK_Y
    const T0 = TRACK_Y;
    const greenTopMat = new THREE.MeshStandardMaterial({
      map: this.greenCarpetTex,
      roughness: 0.97,
      metalness: 0.0
    });
    const baseSideMat = new THREE.MeshStandardMaterial({
      color: 0x24272c,
      roughness: 0.8,
      metalness: 0.05
    });
    // Pedana con faccia superiore in moquette (indice materiale 2 del BoxGeometry = +Y)
    const platformMats = [baseSideMat, baseSideMat, greenTopMat, baseSideMat, baseSideMat, baseSideMat];
    box(BW, 0.06, BD, platformMats, BX, T0 - 0.03, BZ);

    // Struttura portante sotto il tavolo (pannelli in multistrato verniciato)
    const underPlatformMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85, metalness: 0.0 });
    const underH = (T0 - 0.06) - FLOOR;
    box(BW - 0.16, underH, BD - 0.16, underPlatformMat, BX, FLOOR + underH / 2, BZ);

    // Fascia perimetrale opaca con profilo in alluminio spazzolato e pannelli sponsor RC
    const fasciaM = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.7 });
    const aluMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.38, metalness: 0.85 });
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
      box(w + fT, 0.15, fT, fasciaM, x, T0 - 0.065, z, { ry });
      box(w + fT + 0.004, 0.008, fT + 0.004, aluMat, x, T0 - 0.002, z, { ry, cast: false });
      const n = Math.floor(w / 1.3), nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
      for (let i = 0; i < n; i++) {
        const b = B.BRANDS[Math.abs(i + Math.round(ry * 2)) % B.BRANDS.length];
        const off = (i - (n - 1) / 2) * 1.3;
        plane(
          1.1,
          0.12,
          new THREE.MeshStandardMaterial({ map: B.brandBoard(b, 1024, 128), roughness: 0.6 }),
          x + tx * off + nx * 0.016,
          T0 - 0.072,
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
    this.buildAutoScaleShowcase(root, -0.82, FLOOR, RZ0 + 0.25);

    // 5. ELEMENTO ORIGINALE MINI-Z: Podio Premiazione 1° / 2° / 3° Posto "Mini-Z Cup"
    this.buildWinnersPodium(root, 5.45, FLOOR, RZ0 + 0.38);

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
      box(0.36, 0.015, 1.5, new THREE.MeshPhysicalMaterial({ color: 0xdbe6ef, roughness: 0.08, metalness: 0.1, clearcoat: 1.0, transparent: true, opacity: 0.34, depthWrite: false }), tx, FLOOR + y, tz, { cast: false });
      for (let k = 0; k < 4; k++) {
        const s = 0.8 + ((k * 7 + y * 10) % 5) * 0.12;
        const cup = add(cupGeo, (k + Math.round(y * 10)) % 3 ? gold : silver, tx - 0.03, FLOOR + y + 0.008, tz - 0.54 + k * 0.36);
        cup.scale.setScalar(s);
      }
    }
    plane(1.5, 1.86, new THREE.MeshPhysicalMaterial({ color: 0xe6f0fa, roughness: 0.05, metalness: 0.08, clearcoat: 1.0, transparent: true, opacity: 0.16, depthWrite: false }), RX1 - 0.47, FLOOR + 0.98, tz, { ry: -Math.PI / 2 });

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
      // Il banco centrale (bz === -2.6) è il Banco Box personale del giocatore: monta il cavalletto anodizzato per la sua Mini-Z!
      const isPlayerBench = Math.abs(bz - (-2.6)) < 0.05;
      buildBenchEquipment(root, M, {
        x: bx,
        y: FLOOR + 0.927,
        z: bz - 0.15,
        room: 'Legno',
        car: !isPlayerBench,
        stand: isPlayerBench,
        worker: bz === -5.4 ? { x: 0.8, z: 0.45, rotation: Math.PI / 2, stool: false } : null
      });
      if (isPlayerBench) {
        // Il fondo della vasca MR-04 è a +0.0034m nel sistema dell'auto; con y = +0.0282m il fondo poggia esattamente sulla gomma antiscivolo del cavalletto (y = 0.0316m)
        // lasciando le 4 ruote sollevate di 9 mm nell'aria!
        this.playerWorkbenchPose = {
          x: bx,
          y: FLOOR + 0.927 + 0.0282,
          z: bz - 0.17,
          heading: 0,
          shellY: FLOOR + 0.927 + 0.0052
        };
      }
      cyl(0.17, 0.17, 0.05, new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 }), bx + 0.8, FLOOR + (bz === -5.4 ? 0.61 : 0.66), bz + 0.3, { seg: 28 });
      cyl(0.025, 0.025, 0.62, M.metal, bx + 0.8, FLOOR + 0.32, bz + 0.3);
      cyl(0.22, 0.22, 0.02, M.darkMetal, bx + 0.8, FLOOR + 0.01, bz + 0.3, { seg: 28 });
    }
    buildClubAmenities(root, M, 'Mini-Z');

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
    // Pannello paragambe anteriore sul palco piloti con grafica Kyosho Mini-Z Cup
    const standSkirtTex = canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = '#141821';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8141b';
      g.fillRect(0, 0, w, 18);
      g.fillRect(0, h - 14, w, 14);
      g.fillStyle = '#ffffff';
      g.font = `italic 900 46px ${B.FONT}`;
      g.textAlign = 'center';
      g.fillText('KYOSHO MINI-Z CUP · PALCO PILOTI UFFICIALE', w / 2, 102);
    }, { clamp: true });
    box(ROST.x1 - ROST.x0 - 0.08, 0.62, 0.024, new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.5 }), (ROST.x0 + ROST.x1) / 2, ROST.top + 0.32, railZ);
    plane(ROST.x1 - ROST.x0 - 0.12, 0.58, new THREE.MeshStandardMaterial({ map: standSkirtTex, roughness: 0.45 }), (ROST.x0 + ROST.x1) / 2, ROST.top + 0.32, railZ - 0.015, { ry: Math.PI });

    this.stationDisplays = createStationDisplays(LANES);
    const stationScreenM = new THREE.MeshBasicMaterial({ map: this.stationDisplays.tex });
    LANES.forEach((L, i) => {
      const x = ROST.x0 + 0.85 + i * 1.45;
      // Targhetta canale 2.4GHz FHS/ASF + display telemetria giro (senza prese banana da slot-car!)
      printBoxFace(box(0.2, 0.012, 0.12, new THREE.MeshStandardMaterial({ map: details.stationLabels[i], roughness: 0.65 }), x, railY + 0.021, railZ), 2, [0.01, 0.5]);
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

  // Vetrina espositiva illuminata "Kyosho AutoScale Collection" con veri modelli 3D in scala 1:27 sotto teca acrilica
  buildAutoScaleShowcase(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.38, metalness: 0.55 });
    const redAccent = new THREE.MeshStandardMaterial({ color: 0xa91d24, roughness: 0.38 });
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x0f1218, roughness: 0.32, metalness: 0.4 });
    const brassPlateMat = new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.28, metalness: 0.85 });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xfff8eb });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6f1fa,
      transparent: true,
      opacity: 0.18,
      roughness: 0.06,
      metalness: 0.08,
      clearcoat: 1.0,
      depthWrite: false
    });
    const domeGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      roughness: 0.04,
      metalness: 0.05,
      clearcoat: 1.0,
      depthWrite: false
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.35, 0.44), frameMat);
    base.position.y = 0.175;
    base.castShadow = true;
    base.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 0.44), redAccent);
    top.position.y = 1.92;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.50, 0.03), frameMat);
    back.position.set(0, 1.10, -0.20);
    g.add(base, top, back);

    // Montanti laterali della vetrina
    for (const sx of [-0.575, 0.575]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.50, 0.42), frameMat);
      pillar.position.set(sx, 1.10, 0);
      g.add(pillar);
    }

    const headerTex = canvasTex(512, 64, (ctx, w, h) => {
      ctx.fillStyle = '#9e1920';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'italic 900 28px "Titillium Web", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('KYOSHO AUTOSCALE COLLECTION · 1:27', w / 2, 42);
    }, { clamp: true });
    const headerPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.10, 0.11), new THREE.MeshBasicMaterial({ map: headerTex }));
    headerPlane.position.set(0, 1.92, 0.222);
    g.add(headerPlane);

    const showcaseSpecs = [
      { name: 'FERRARI 499P #51', num: 51, style: 'mid', base: '#b91c1c', acc: '#eab308', acc2: '#ffffff', sponsor: 'AF CORSE', sponsor2: 'KYOSHO', sponsorCol: '#ffffff', textCol: '#fde047', drvName: 'LE MANS', rim: '#d4d8e0' },
      { name: 'FERRARI 499P #83', num: 83, style: 'mid', base: '#eab308', acc: '#b91c1c', acc2: '#111827', sponsor: 'AF CORSE', sponsor2: 'KYOSHO', sponsorCol: '#111827', textCol: '#b91c1c', drvName: 'MODENA', rim: '#d4d8e0' },
      { name: 'PORSCHE 963 LMDh', num: 6, style: 'front', base: '#e2e8f0', acc: '#b91c1c', acc2: '#111827', sponsor: 'PENSKE', sponsor2: 'MINI-Z', sponsorCol: '#b91c1c', textCol: '#111827', drvName: 'WERKS', rim: '#1e293b' },
      { name: 'MAZDASPEED 787B', num: 55, style: 'back', base: '#ea580c', acc: '#15803d', acc2: '#ffffff', sponsor: 'RENOWN', sponsor2: 'KYOSHO', sponsorCol: '#ffffff', textCol: '#fde047', drvName: 'ROTARY', rim: '#e2e8f0' },
      { name: 'NISSAN GT-R NISMO', num: 23, style: 'front', base: '#1d4ed8', acc: '#e2e8f0', acc2: '#dc2626', sponsor: 'CALSONIC', sponsor2: 'AUTOSCALE', sponsorCol: '#ffffff', textCol: '#ffffff', drvName: 'GT500', rim: '#cbd5e1' },
      { name: 'McLAREN F1 GTR', num: 60, style: 'mid', base: '#0f766e', acc: '#f59e0b', acc2: '#ffffff', sponsor: 'FINA GTR', sponsor2: 'MINI-Z', sponsorCol: '#ffffff', textCol: '#fde047', drvName: 'LONGTAIL', rim: '#d8b448' }
    ];

    for (let s = 0; s < 3; s++) {
      const sy = 0.65 + s * 0.42;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.014, 0.38), glassMat);
      shelf.position.y = sy;
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.008, 0.02), ledMat);
      led.position.set(0, sy + 0.38, 0.14);
      g.add(shelf, led);

      for (let c = 0; c < 2; c++) {
        const idx = s * 2 + c;
        const spec = showcaseSpecs[idx];
        const cx = -0.27 + c * 0.54;

        // Basetta espositiva nera Kyosho AutoScale con targhetta dorata e teca trasparente
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.018, 0.135), plinthMat);
        plinth.position.set(cx, sy + 0.016, 0);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.009, 0.004), brassPlateMat);
        plate.position.set(cx, sy + 0.016, 0.068);
        const dome = new THREE.Mesh(new THREE.BoxGeometry(0.238, 0.078, 0.124), domeGlassMat);
        dome.position.set(cx, sy + 0.064, 0);

        // Vero modello 3D d'auto da corsa in scala 1:27 (con ruote, cockpit, alettone, fari e livrea!)
        const carModel = makeCar(spec);
        carModel.root.scale.setScalar(1.06);
        carModel.root.position.set(cx, sy + 0.025, 0);
        carModel.root.rotation.y = c === 0 ? 0.22 : -0.22;

        g.add(plinth, plate, carModel.root, dome);
      }
    }

    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.48), glassMat);
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

  // Genera una curva chiusa smussata a 600 campioni preservando le curve tecniche e i tornanti di ogni tracciato
  buildZeroFoldSamples(waypoints, numSamples = 600, smoothIterations = 8) {
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
    this.curveSamples = this.buildZeroFoldSamples(rawPoints, numSamples, 8);

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

    // 3b. Allestimento scenografico interno in scala 1:27 sul tappeto verde (cartelloni sponsor, box telemetria e gomme di protezione)
    this.buildInfieldScenery(this.curveSamples, laneHalf);

    // 4. Posizione di partenza: la pole è sul rettilineo principale prima del ponte (dritta, in corsia)
    const startIdx = (bridgeIdx - 28 + numSamples) % numSamples;
    const startSample = this.curveSamples[startIdx];
    this.gridStartT = this.nearestCurveT(startSample.pt);
    this.lapLineT = this.nearestCurveT(bridgeSample.pt);
    const playerSlot = this.gridSlot(0);

    // 5. Crea / reimposta le 3 Auto Avversarie AI Mini-Z sulla griglia, dietro al giocatore
    this.spawnAiCars();

    this.lastBridgeSide = null;
    this.lapArmed = false;

    return {
      spec,
      startX: playerSlot.x,
      startZ: playerSlot.z,
      startHeading: playerSlot.heading,
      gripMultiplier: spec.gripMultiplier,
      waypoints: spec.waypoints,
      tvCameras: spec.tvCameras,
      checkCollision: (x, z, carRadius) => this.checkCollision(x, z, carRadius, laneHalf),
      checkLapCrossing: (x, z) => this.checkLapCrossing(x, z, bridgeSample)
    };
  }

  setAiDifficulty(level) {
    this.aiLevel = ['none', 'beginner', 'club', 'expert', 'pro'].includes(level) ? level : 'club';
    this.aiCarsGroup.visible = this.aiLevel !== 'none';
  }

  // Parametro t (0..1, a passo costante in metri) del punto della curva più vicino a p
  nearestCurveT(p) {
    const n = 1200;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const q = this.curve.getPointAt(i / n);
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i / n;
      }
    }
    return best;
  }

  // Posizione k in griglia (0 = pole): file sfalsate, la pole a sinistra, la seconda a destra 30 cm dietro...
  gridSlot(k) {
    const trackLen = Math.max(12, this.totalTrackLength);
    const t = (((this.gridStartT ?? 0) - (k * GRID_ROW_GAP) / trackLen) % 1 + 1) % 1;
    const lane = k % 2 === 0 ? -GRID_LATERAL : GRID_LATERAL;
    const pt = this.curve.getPointAt(t);
    const tan = this.curve.getTangentAt(t).normalize();
    return {
      t,
      lane,
      x: pt.x - tan.z * lane,
      z: pt.z + tan.x * lane,
      heading: Math.atan2(tan.x, tan.z)
    };
  }

  spawnAiCars() {
    while (this.aiCarsGroup.children.length > 0) {
      this.aiCarsGroup.remove(this.aiCarsGroup.children[0]);
    }
    this.aiCars = [];
    this.aiCarsGroup.visible = this.aiLevel !== 'none';

    for (let i = 1; i <= 3; i++) {
      const drv = DRIVERS[i];
      const carObj = makeCar(drv);
      carObj.root.scale.setScalar(1.16);
      this.aiCarsGroup.add(carObj.root);

      const baseOffset = (i - 2) * 0.16;
      // Il giocatore è in pole (posizione 0), gli avversari nelle posizioni 1, 2 e 3 dietro di lui
      const slot = this.curve ? this.gridSlot(i) : { t: (0.04 - i * 0.025 + 1) % 1, lane: baseOffset };
      this.aiCars.push({
        id: `ai${i}`,
        driver: drv,
        carObj,
        t: slot.t,
        baseLaneOffset: baseOffset,
        laneOffset: slot.lane,
        targetLaneOffset: slot.lane,
        latVel: 0,
        throttleEst: 0,
        x: 0,
        z: 0,
        fx: 1,
        fz: 0,
        speed: 0,
        laps: 0,
        lapTime: 0,
        lastLap: null,
        bestLap: null,
        errorState: 'none',
        errorTimer: 0,
        errorCooldown: 1.5 + i * 1.4,
        yawSlip: 0,
        rollAngle: 0
      });
    }

    if (this.curve) this.aiCars.forEach((ai) => this.placeAiCar(ai));

    // Sostituisce le auto AI procedurali con veri modelli 3D Hypercar in scala 1:27 con livree WEC desaturate e realistiche
    const applyGlbToAiCars = (gltfScene) => {
      const aiTints = ['#c99e28', '#336699', '#d1d7e0']; // #83 Giallo Modena naturale, #50 Blu Corsa, #51 Bianco/Rosso
      this.aiCars.forEach((ai, idx) => {
        const clone = gltfScene.clone(true);
        const tintHex = aiTints[idx % aiTints.length];

        clone.traverse((node) => {
          const name = node.name || '';
          const matName = node.material?.name || '';
          // Esclude anche i 150+ micro-pulsanti interni del volante per garantire 60+ FPS costanti!
          if (
            /RIM_BLUR|Rim_Blurred|COCKPIT_LR|STEER_LR|STEER_HR|DAMAGE|glow|LED_0|TXLAP|TXDEL|TXFUEL|LAPTIME|DELTA2|FUEL2|WIPER/i.test(name) ||
            /Rim_Blur|GLOW|TRANSPARENTE|kers_|963_|sw_|shift_lights|dials_alpha|logo_cos/i.test(matName)
          ) {
            node.visible = false;
          }
          if (node.isMesh && node.visible) {
            node.castShadow = /^Body$|^main$|Tyre|RIMS/i.test(matName);
            node.receiveShadow = true;
            node.material = Array.isArray(node.material)
              ? node.material.map((m) => (m ? m.clone() : m))
              : node.material
                ? node.material.clone()
                : node.material;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((mat) => {
              if (!mat) return;
              const mName = mat.name || '';
              if (/^Body$/i.test(mName) || /^main$/i.test(mName)) {
                if (mat.color) {
                  mat.color.set(tintHex);
                  const hsl = { h: 0, s: 0, l: 0 };
                  mat.color.getHSL(hsl);
                  mat.color.setHSL(hsl.h, hsl.s * 0.62, hsl.l * 0.89);
                }
                mat.metalness = 0.06;
                mat.roughness = 0.34;
                if ('clearcoat' in mat) {
                  mat.clearcoat = 0.85;
                  mat.clearcoatRoughness = 0.09;
                }
                if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
                mat.emissiveMap = null;
                mat.emissiveIntensity = 0.0;
                mat.envMapIntensity = 0.92;
                mat.needsUpdate = true;
              }
            });
          }
        });

        clone.updateMatrixWorld(true);
        const box = new THREE.Box3();
        clone.traverse((node) => {
          if (node.isMesh && node.visible) {
            let p = node.parent;
            let allVis = true;
            while (p) {
              if (!p.visible) {
                allVis = false;
                break;
              }
              p = p.parent;
            }
            if (allVis) box.expandByObject(node);
          }
        });
        const size = new THREE.Vector3();
        box.getSize(size);
        const scaleFactor = 0.172 / Math.max(size.z, size.x, 0.001);
        clone.scale.setScalar(scaleFactor);
        // Orienta il muso lungo +X locale di ai.carObj.root
        clone.rotation.y = Math.PI / 2;
        clone.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3();
        clone.traverse((node) => {
          if (node.isMesh && node.visible) {
            let p = node.parent;
            let allVis = true;
            while (p) {
              if (!p.visible) {
                allVis = false;
                break;
              }
              p = p.parent;
            }
            if (allVis) scaledBox.expandByObject(node);
          }
        });
        const scCenter = new THREE.Vector3();
        scaledBox.getCenter(scCenter);
        clone.position.x -= scCenter.x;
        clone.position.z -= scCenter.z;
        clone.position.y -= scaledBox.min.y;

        while (ai.carObj.root.children.length > 0) {
          ai.carObj.root.remove(ai.carObj.root.children[0]);
        }
        ai.carObj.wheels = [];
        ai.carObj.root.scale.setScalar(1.0);
        ai.carObj.root.add(clone);
      });
    };

    if (this.aiGlbScene) {
      applyGlbToAiCars(this.aiGlbScene);
    } else {
      const loader = new GLTFLoader();
      loader.load(
        '/models/ferrari_499p.glb',
        (gltf) => {
          this.aiGlbScene = gltf.scene;
          applyGlbToAiCars(gltf.scene);
        },
        undefined,
        () => {}
      );
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

    const cRed = new THREE.Color(0xa8242b);
    const cWhite = new THREE.Color(0xd8dde6);
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

    // Vere sponde perimetrali Kyosho RCP in gomma espansa EVA grigio-antracite scuro opaco (con inserti bianchi/rossi desaturati agli apici curva)
    const cRed = new THREE.Color(0x7c2a2e);
    const cWhite = new THREE.Color(0xbec4cd);
    const cDark = new THREE.Color(0x232730);
    const cDarkAlt = new THREE.Color(0x2a2f39);

    for (let i = 0; i < n; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % n];

      const isSharpCorner = s0.cornerWeight > 0.55;
      const bandIdx = Math.floor(i / 6);
      let col = bandIdx % 2 === 0 ? cDark : cDarkAlt;
      if (isSharpCorner && bandIdx % 3 === 0) {
        col = bandIdx % 6 === 0 ? cRed : cWhite;
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

  // Crea la grafica ad alta definizione di un adesivo sponsor piatto (vinyl floor decal) incollato sul piano pista
  createFlatSponsorStickerTex(spec) {
    return canvasTex(512, 200, (g, w, h) => {
      g.clearRect(0, 0, w, h);

      // Bordo esterno fustellato bianco/argento tipico degli adesivi in vinile da pista RC
      const r = 22;
      const drawRoundRect = (x, y, rw, rh, rad) => {
        g.beginPath();
        g.moveTo(x + rad, y);
        g.lineTo(x + rw - rad, y);
        g.quadraticCurveTo(x + rw, y, x + rw, y + rad);
        g.lineTo(x + rw, y + rh - rad);
        g.quadraticCurveTo(x + rw, y + rh, x + rw - rad, y + rh);
        g.lineTo(x + rad, y + rh);
        g.quadraticCurveTo(x, y + rh, x, y + rh - rad);
        g.lineTo(x, y + rad);
        g.quadraticCurveTo(x, y, x + rad, y);
        g.closePath();
      };

      drawRoundRect(4, 4, w - 8, h - 8, r);
      g.fillStyle = '#dde3ec';
      g.fill();

      drawRoundRect(12, 12, w - 24, h - 24, r - 5);
      g.fillStyle = spec.bg;
      g.fill();

      // Banda obliqua racing laterale
      g.save();
      drawRoundRect(12, 12, w - 24, h - 24, r - 5);
      g.clip();
      g.fillStyle = spec.accent;
      g.beginPath();
      g.moveTo(12, 12);
      g.lineTo(138, 12);
      g.lineTo(96, h - 12);
      g.lineTo(12, h - 12);
      g.closePath();
      g.fill();

      // Striscia secondaria sottile
      g.fillStyle = spec.stripe || '#ffffff';
      g.beginPath();
      g.moveTo(146, 12);
      g.lineTo(162, 12);
      g.lineTo(120, h - 12);
      g.lineTo(104, h - 12);
      g.closePath();
      g.fill();
      g.restore();

      // Sigla / Badge a sinistra
      g.fillStyle = spec.badgeFg || '#ffffff';
      g.font = `italic 900 44px ${B.FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(spec.badge, 68, h / 2 + 2);

      // Nome principale dello Sponsor
      g.fillStyle = spec.fg || '#ffffff';
      g.font = `italic 900 54px ${B.FONT}`;
      g.textAlign = 'left';
      g.fillText(spec.title, 174, h / 2 - 14);

      // Sottotitolo tecnico
      g.fillStyle = spec.subColor || '#cbd5e1';
      g.font = `700 22px ${B.FONT}`;
      g.fillText(spec.sub, 176, h / 2 + 36);
    }, { clamp: true });
  }

  // Sponsor piatti come veri adesivi in vinile incollati sul piano pista (ZERO cartelli 3D verticali!)
  buildInfieldScenery(samples, laneHalf) {
    const minClearance = laneHalf + 0.34;
    const isFarFromTrack = (x, z, minDist = minClearance) => {
      const minSq = minDist * minDist;
      for (let i = 0; i < samples.length; i += 3) {
        const p = samples[i].pt;
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < minSq) return false;
      }
      return true;
    };

    const sceneryGroup = new THREE.Group();
    sceneryGroup.name = 'Adesivi Sponsor Piatti Mini-Z 1:27';

    const stickerSpecs = [
      { badge: 'KZ', title: 'KYOSHO', sub: 'OFFICIAL MINI-Z CUP 1:27', bg: '#1a1e26', accent: '#8c2828', stripe: '#d8dee8', fg: '#e2e8f0' },
      { badge: 'PN', title: 'PN RACING', sub: 'WORLD CHAMPION TUNING', bg: '#182232', accent: '#9c621c', stripe: '#d8dee8', fg: '#e2e8f0' },
      { badge: 'SH', title: 'SPEED HOUSE', sub: 'X-SPEED 8500KV & AAA Ni-MH', bg: '#191c22', accent: '#1e6082', stripe: '#b89628', fg: '#e2e8f0' },
      { badge: 'MK', title: 'MARKA', sub: 'PRO RADIAL SLICK TIRES', bg: '#1e1b1a', accent: '#8f3f1e', stripe: '#d8dee8', fg: '#e2e8f0' },
      { badge: 'GL', title: 'GL RACING', sub: 'CARBON CHASSIS SERIES', bg: '#192342', accent: '#284c8f', stripe: '#8ea8cc', fg: '#e2e8f0' },
      { badge: 'KO', title: 'KO PROPO', sub: 'EX-NEXT 2.4GHz TELEMETRY', bg: '#1a1a1e', accent: '#7a2424', stripe: '#c4c8d0', fg: '#e2e8f0' },
      { badge: 'AT', title: 'ATOMIC RC', sub: 'PRECISION METAL UPGRADES', bg: '#17241d', accent: '#226338', stripe: '#7ab08e', fg: '#e2e8f0' },
      { badge: 'RCP', title: 'RCP TRACK', sub: 'HIGH-GRIP EVA FOAM SYSTEM', bg: '#1e242d', accent: '#8c2828', stripe: '#cbd5e1', fg: '#e2e8f0' }
    ];

    // Posizioni candidate sul piano del tavolo (sceglie automaticamente quelle libere fuori dalle corsie di ciascuna pista)
    const candidateSpots = [
      [0.35, -0.45,  0.04],
      [2.45, -0.45,  0.00],
      [4.55, -0.45, -0.04],
      [1.10, -1.65, -0.06],
      [3.85, -1.65,  0.05],
      [2.45, -2.25,  0.00],
      [5.15, -2.15, -0.08],
      [-0.25, -2.15, 0.08],
      [2.45, -3.15,  0.00],
      [4.55, -3.05,  0.05],
      [0.45, -3.05, -0.05]
    ];

    const placed = [];
    for (let i = 0; i < candidateSpots.length; i++) {
      const [sx, sz, rotZ] = candidateSpots[i];
      if (!isFarFromTrack(sx, sz, laneHalf + 0.34)) continue;
      let tooCloseToOther = false;
      for (const p of placed) {
        if ((p[0] - sx) ** 2 + (p[1] - sz) ** 2 < 1.35 * 1.35) {
          tooCloseToOther = true;
          break;
        }
      }
      if (tooCloseToOther) continue;

      const spec = stickerSpecs[placed.length % stickerSpecs.length];
      const tex = this.createFlatSponsorStickerTex(spec);
      const stickerMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.42,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });

      const stickerMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.30), stickerMat);
      stickerMesh.rotation.x = -Math.PI / 2;
      stickerMesh.rotation.z = rotZ;
      // Appoggiato piatto come un vero adesivo sul tappeto del tavolo (y = 0.0018m)
      stickerMesh.position.set(sx, 0.0018, sz);
      stickerMesh.receiveShadow = true;
      stickerMesh.castShadow = false;
      sceneryGroup.add(stickerMesh);

      placed.push([sx, sz]);
      if (placed.length >= 6) break;
    }

    this.trackGroup.add(sceneryGroup);
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

  animateCharacters(timeSec, _carPos, _isSpeaking, frameDt = 1 / 60, cameraPos = null, playerThrottle = 0) {
    const dt = frameDt;
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

    if (this.curve && this.aiCars.length > 0 && this.aiLevel !== 'none') {
      // In griglia (impostazioni gara, semaforo, fine gara) le auto IA restano ferme ma posizionate
      const dt = this.aiPaused ? 0 : frameDt;
      // Fisica e prestazioni IA identiche alle vere Mini-Z 1:27 su pista RCP, con veri errori umani in base al livello!
      // Principiante (~11.5 km/h, errori frequenti), Club (~14.5 km/h, qualche largo/scodata), Esperto (~17 km/h, errori rari), Pro (~19.5 km/h, precisissimo)
      const levelParams = {
        beginner: { top: 3.20, min: 1.15, latGrip: 3.1, accel: 4.5, brake: 5.2, errProb: 0.95, errDur: 1.35 },
        club:     { top: 4.05, min: 1.45, latGrip: 4.2, accel: 5.8, brake: 6.0, errProb: 0.48, errDur: 1.10 },
        expert:   { top: 4.75, min: 1.78, latGrip: 5.4, accel: 7.2, brake: 6.6, errProb: 0.22, errDur: 0.85 },
        pro:      { top: 5.45, min: 2.08, latGrip: 6.6, accel: 8.6, brake: 7.2, errProb: 0.08, errDur: 0.65 }
      }[this.aiLevel] || { top: 4.05, min: 1.45, latGrip: 4.2, accel: 5.8, brake: 6.0, errProb: 0.48, errDur: 1.10 };

      const trackLen = Math.max(12, this.totalTrackLength);
      const laneHalf = (this.activeTrackSpec?.laneWidth || 0.80) * 0.5;
      const maxSafeOffset = Math.max(0.14, laneHalf - 0.075);

      for (let i = 0; i < this.aiCars.length; i++) {
        const ai = this.aiCars[i];
        const dsLook = 0.48; // Guarda 48 cm avanti per impostare la staccata prima della curva
        const dtLook = dsLook / trackLen;
        const tAhead = (ai.t + dtLook) % 1;
        const tNear = (ai.t + 0.015) % 1;

        const tanNow = this.curve.getTangentAt(ai.t);
        const tanNear = this.curve.getTangentAt(tNear);
        const tanAhead = this.curve.getTangentAt(tAhead);

        const angleAhead = tanNow.angleTo(tanAhead);
        const angleNow = tanNow.angleTo(tanNear);
        // Segno della curva (+1 destra, -1 sinistra)
        const crossSign = Math.sign(tanNow.x * tanAhead.z - tanNow.z * tanAhead.x) || 1;

        // Raggio di curvatura reale R = ds / dTheta -> velocità massima fisica in curva v = sqrt(a_lat * R)
        const radiusAhead = dsLook / Math.max(0.015, angleAhead);
        const radiusNow = (0.015 * trackLen) / Math.max(0.01, angleNow);
        const effRadius = Math.min(radiusAhead, radiusNow * 1.1);
        const cornerMaxSpeed = Math.sqrt(levelParams.latGrip * effRadius);

        // Gestione errori realistici dell'IA in staccata e a centro curva
        if (ai.errorCooldown > 0) ai.errorCooldown -= dt;

        if (ai.errorState === 'none') {
          // Quando l'IA entra in una curva impegnativa può commettere un errore umano!
          if (angleAhead > 0.24 && ai.errorCooldown <= 0 && Math.random() < levelParams.errProb * dt * 1.8) {
            const roll = Math.random();
            if (roll < 0.46) {
              // 1. Arriva lungo in staccata e allarga verso la sponda esterna!
              ai.errorState = 'late_brake';
              ai.errorTimer = levelParams.errDur * (0.85 + Math.random() * 0.35);
              ai.targetLaneOffset = clamp(-crossSign * maxSafeOffset * 0.96, -maxSafeOffset, maxSafeOffset);
            } else if (roll < 0.82) {
              // 2. Scodata di potenza in uscita di curva con controsterzo e perdita di trazione!
              ai.errorState = 'oversteer_wiggle';
              ai.errorTimer = levelParams.errDur * 0.85;
              ai.targetLaneOffset = clamp(ai.baseLaneOffset + (Math.random() - 0.5) * 0.24, -maxSafeOffset, maxSafeOffset);
            } else {
              // 3. Pizzica il cordolo interno scomponendo l'assetto!
              ai.errorState = 'curb_touch';
              ai.errorTimer = levelParams.errDur * 0.75;
              ai.targetLaneOffset = clamp(crossSign * maxSafeOffset * 0.92, -maxSafeOffset, maxSafeOffset);
            }
            ai.errorCooldown = 3.2 + Math.random() * 4.0;
            this.onAiMistake?.(ai.driver.name, ai.errorState);
          } else {
            // Traiettoria ideale da gara (stringe leggermente alla corda interna in curva)
            const racingApexOffset = angleNow > 0.08 ? crossSign * 0.09 : 0;
            ai.targetLaneOffset = clamp(ai.baseLaneOffset + racingApexOffset, -maxSafeOffset * 0.82, maxSafeOffset * 0.82);
          }
        } else {
          ai.errorTimer -= dt;
          if (ai.errorTimer <= 0) {
            ai.errorState = 'none';
            ai.targetLaneOffset = ai.baseLaneOffset;
          }
        }

        // Calcolo velocità target con eventuale penalità durante l'errore
        let targetSpeed = clamp(
          Math.min(levelParams.top, cornerMaxSpeed) * (ai.driver.pace || 1.0),
          levelParams.min,
          levelParams.top
        );

        if (ai.errorState === 'late_brake') {
          // All'inizio frena tardi, poi deve rallentare forte per non sbattere!
          targetSpeed *= ai.errorTimer > levelParams.errDur * 0.55 ? 1.08 : 0.58;
        } else if (ai.errorState === 'oversteer_wiggle') {
          targetSpeed *= 0.64;
        } else if (ai.errorState === 'curb_touch') {
          targetSpeed *= 0.70;
        }

        // Traffico: un'auto davanti nella stessa traiettoria (giocatore o altro avversario) va superata
        // spostandosi di lato, oppure seguita alzando il gas, non tamponata alla cieca
        const fwdX = tanNow.x, fwdZ = tanNow.z;
        const fLen = Math.hypot(fwdX, fwdZ) || 1;
        const ux = fwdX / fLen, uz = fwdZ / fLen;
        const others = this.aiCars.filter((o) => o !== ai).map((o) => ({ x: o.x, z: o.z, vx: o.fx * o.speed, vz: o.fz * o.speed }));
        if (this.playerBody?.active) others.push(this.playerBody);
        for (const o of others) {
          const dx = o.x - ai.x;
          const dz = o.z - ai.z;
          const along = dx * ux + dz * uz;
          const lat = dx * -uz + dz * ux;
          if (along < 0.04 || along > 0.5 || Math.abs(lat) > 0.13) continue;
          const oSpeed = o.vx * ux + o.vz * uz;
          targetSpeed = Math.min(targetSpeed, Math.max(0, oSpeed + (along - 0.24) * 4));
          if (ai.errorState === 'none') {
            const oLane = ai.laneOffset + lat;
            let side = lat >= 0 ? -1 : 1;
            if (Math.abs(oLane + side * 0.17) > maxSafeOffset) side = -side;
            ai.targetLaneOffset = clamp(oLane + side * 0.17, -maxSafeOffset, maxSafeOffset);
          }
        }

        // Rispetta i veri limiti fisici di accelerazione e frenata (mai variazioni istantanee!)
        const speedBefore = ai.speed;
        if (targetSpeed > ai.speed) {
          ai.speed = Math.min(targetSpeed, ai.speed + levelParams.accel * dt);
        } else {
          ai.speed = Math.max(targetSpeed, ai.speed - levelParams.brake * dt);
        }

        // Gas stimato dall'accelerazione: serve al suono del motore dell'avversario
        const thrTarget = dt > 0 ? (ai.speed > speedBefore + 0.001 ? 1 : ai.speed < speedBefore - 0.001 ? 0.05 : 0.45) : 0;
        ai.throttleEst += (thrTarget - ai.throttleEst) * Math.min(1, dt * 8);

        const prevT = ai.t;
        ai.t = (ai.t + (ai.speed * dt) / trackLen) % 1;
        ai.lapTime += dt;
        // Il giro si conta passando sotto il ponte di cronometraggio, come per il giocatore
        const lineT = this.lapLineT ?? 0;
        const crossed = ai.t >= prevT ? prevT < lineT && ai.t >= lineT : prevT < lineT || ai.t >= lineT;
        if (dt > 0 && crossed) {
          ai.laps++;
          if (ai.lapTime > 3.8) {
            ai.lastLap = ai.lapTime;
            ai.bestLap = ai.bestLap ? Math.min(ai.bestLap, ai.lapTime) : ai.lapTime;
          }
          ai.lapTime = 0;
        }

        // Spostamento laterale fluido in corsia (e scarto rapido quando commette un errore)
        const latRate = ai.errorState === 'none' ? 2.8 : 4.2;
        ai.laneOffset += (ai.targetLaneOffset - ai.laneOffset) * Math.min(1, dt * latRate);
        // Spinta laterale ricevuta in un contatto: si smorza con l'aderenza delle gomme
        ai.laneOffset = clamp(ai.laneOffset + ai.latVel * dt, -maxSafeOffset, maxSafeOffset);
        ai.latVel *= Math.exp(-dt * 7);

        // Angolo di imbardata extra (scodata/controsterzo visibile quando sbaglia)
        let targetYawSlip = 0;
        let targetRoll = 0;
        if (ai.errorState === 'oversteer_wiggle') {
          targetYawSlip = Math.sin(timeSec * 18 + i) * 0.28;
        } else if (ai.errorState === 'late_brake') {
          targetYawSlip = -crossSign * 0.16;
        } else if (ai.errorState === 'curb_touch') {
          targetRoll = crossSign * 0.14;
        }
        ai.yawSlip += (targetYawSlip - ai.yawSlip) * Math.min(1, dt * 12);
        ai.yawKick = (ai.yawKick || 0) * Math.exp(-dt * 5);
        ai.rollAngle += (targetRoll - ai.rollAngle) * Math.min(1, dt * 14);

        this.placeAiCar(ai);

        for (const w of ai.carObj.wheels) {
          w.g.rotation.z -= (ai.speed * dt) / w.r;
        }
      }
    }
  }

  placeAiCar(ai) {
    const pt = this.curve.getPointAt(ai.t);
    const tan = this.curve.getTangentAt(ai.t).normalize();
    ai.x = pt.x - tan.z * ai.laneOffset;
    ai.z = pt.z + tan.x * ai.laneOffset;
    const yaw = ai.yawSlip + (ai.yawKick || 0);
    // Direzione del muso nel piano (yaw positivo = come l'heading del giocatore)
    const h = Math.atan2(tan.x, tan.z) + yaw;
    ai.fx = Math.sin(h);
    ai.fz = Math.cos(h);
    ai.carObj.root.position.set(ai.x, 0.008, ai.z);
    ai.carObj.root.rotation.set(ai.rollAngle, Math.atan2(-tan.z, tan.x) + yaw, 0);
  }

  // Contatti fisici tra tutte le auto in pista. player: { active, state } dell'auto del giocatore.
  // Restituisce i contatti (per i suoni) già risolti: posizioni e velocità sono aggiornate.
  resolveCarContacts(player) {
    if (!this.curve) return [];
    const trackLen = Math.max(12, this.totalTrackLength);
    const laneHalf = (this.activeTrackSpec?.laneWidth || 0.8) * 0.5;
    const maxSafeOffset = Math.max(0.14, laneHalf - 0.075);
    const bodies = [];

    if (player?.active) {
      const st = player.state;
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      bodies.push({
        id: 'player',
        x: st.x,
        z: st.z,
        fx,
        fz,
        vx: st.vx,
        vz: st.vz,
        halfSeg: CAR_HALF_SEG,
        radius: CAR_RADIUS,
        push(dx, dz) {
          st.x += dx;
          st.z += dz;
          this.x = st.x;
          this.z = st.z;
        },
        impulse(jx, jz, px, pz) {
          st.vx += jx;
          st.vz += jz;
          this.vx = st.vx;
          this.vz = st.vz;
          st.angularVel = clamp(st.angularVel + yawFromImpulse(st.x, st.z, jx, jz, px, pz), -9, 9);
          st.speed = st.vx * fx + st.vz * fz;
        }
      });
    }

    if (this.aiLevel !== 'none' && this.aiCarsGroup.visible) {
      for (const ai of this.aiCars) {
        const tan = this.curve.getTangentAt(ai.t).normalize();
        const nx = -tan.z;
        const nz = tan.x;
        bodies.push({
          id: ai.id,
          x: ai.x,
          z: ai.z,
          fx: ai.fx,
          fz: ai.fz,
          vx: tan.x * ai.speed + nx * ai.latVel,
          vz: tan.z * ai.speed + nz * ai.latVel,
          halfSeg: CAR_HALF_SEG * 1.1,
          radius: CAR_RADIUS * 1.05,
          push(dx, dz) {
            ai.t = (((ai.t + (dx * tan.x + dz * tan.z) / trackLen) % 1) + 1) % 1;
            ai.laneOffset = clamp(ai.laneOffset + dx * nx + dz * nz, -maxSafeOffset, maxSafeOffset);
            this.x += dx;
            this.z += dz;
          },
          impulse(jx, jz, px, pz) {
            ai.speed = Math.max(0, ai.speed + jx * tan.x + jz * tan.z);
            ai.latVel = clamp(ai.latVel + jx * nx + jz * nz, -2.5, 2.5);
            ai.yawKick = clamp((ai.yawKick || 0) + yawFromImpulse(ai.x, ai.z, jx, jz, px, pz) * 0.05, -0.6, 0.6);
            this.vx += jx;
            this.vz += jz;
          }
        });
      }
    }

    if (bodies.length < 2) return [];
    // Due passate: con tre auto a contatto la seconda sistema le compenetrazioni create dalla prima
    const contacts = resolveCarContacts(bodies);
    resolveCarContacts(bodies);
    for (const ai of this.aiCars) this.placeAiCar(ai);
    return contacts;
  }

  // Stato dei motori avversari per l'audio (velocità relativa, gas stimato, posizione nella sala)
  getOpponentEngineStates() {
    if (this.aiLevel === 'none' || !this.aiCarsGroup.visible) return [];
    return this.aiCars.map((ai) => ({
      id: ai.id,
      speedRatio: ai.speed / 5.6,
      throttle: this.aiPaused ? 0 : ai.throttleEst,
      pos: { x: ai.x, y: TRACK_Y + 0.03, z: ai.z },
      pitchBase: 320 + (ai.driver.pace || 1) * 30
    }));
  }
}
