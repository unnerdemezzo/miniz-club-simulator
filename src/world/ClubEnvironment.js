import * as THREE from 'three';
import { REAL_SCALE } from '../data/parts.js';
import { TRACK_LAYOUTS } from '../data/tracks.js';

export class ClubEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.clubGroup = new THREE.Group();
    this.trackGroup = new THREE.Group();
    this.scene.add(this.clubGroup);
    this.scene.add(this.trackGroup);

    // Posizione occhi del pilota sul palco (90cm pedana + 168cm altezza occhi = 2.58m da terra)
    this.driverEyePos = new THREE.Vector3(0.0, REAL_SCALE.DRIVER_EYE_HEIGHT, 2.08);

    // Riferimenti personaggi animati
    this.standPilots = [];
    this.marshals = [];
    this.pitMechanics = [];
    this.raceDirector = null;
    this.bridgeScreenCanvas = null;
    this.bridgeScreenCtx = null;
    this.bridgeScreenTex = null;

    // Dati geometrici pista attiva per collisioni e cronometro
    this.activeTrackSpec = null;
    this.curveSamples = [];
    this.lastBridgeSide = null;
    this.lapArmed = false;

    this.rcpTexture = this.createRcpTileTexture();
    this.buildIndoorHall();
    this.buildDriverStandAndPilots();
    this.buildRaceControlConsole();
    this.buildPitWorkbenches();
  }

  // Crea la texture autentica delle mattonelle in gomma Kyosho RCP 50x50cm a incastro
  createRcpTileTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#222631';
    ctx.fillRect(0, 0, 512, 512);

    // Micro-grana della gomma EVA
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(x, y, 2, 2);
    }

    // Giuntura mattonelle 50x50cm a puzzle
    ctx.strokeStyle = '#161922';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 508);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, 500, 500);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 10);
    return tex;
  }

  buildIndoorHall() {
    // Pavimento del capannone (15m x 11.5m)
    const floorGeo = new THREE.PlaneGeometry(15.5, 11.5);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.55,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    floor.receiveShadow = true;
    this.clubGroup.add(floor);

    // Pareti perimetrali del club (altezza 4.0 metri)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.75
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(15.5, 4.2, 0.2), wallMat);
    backWall.position.set(0, 2.1, -5.6);

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(15.5, 4.2, 0.2), wallMat);
    frontWall.position.set(0, 2.1, 5.6);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 11.5), wallMat);
    leftWall.position.set(-7.65, 2.1, 0);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 11.5), wallMat);
    rightWall.position.set(7.65, 2.1, 0);

    this.clubGroup.add(backWall, frontWall, leftWall, rightWall);

    // Striscia racing rossa e bianca lungo le pareti del club
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
    const backStripe = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.14, 0.02), stripeMat);
    backStripe.position.set(0, 1.15, -5.48);
    this.clubGroup.add(backStripe);

    // Striscioni da gara sulla parete di fondo (visibili alzando lo sguardo dal palco)
    this.addWallBanner(0, 2.55, -5.46, 4.4, 0.95, 'KYOSHO MINI-Z CLUB ARENA', 'CAMPIONATO INDOOR SCALA 1:27 • RCP TRACK', '#dc2626');
    this.addWallBanner(-4.9, 2.55, -5.46, 3.1, 0.85, 'BOX & OFFICINA', 'ASSETTO • GOMME • BRUSHLESS', '#0284c7');
    this.addWallBanner(4.9, 2.55, -5.46, 3.1, 0.85, 'DIREZIONE Gara', 'TELEMETRIA IC-TAG LIVE', '#16a34a');

    // Soffitto con travi reticolari e plafoniere a LED al neon (a 3.95m da terra)
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    for (let z = -3.8; z <= 3.8; z += 1.9) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.12, 0.12), beamMat);
      beam.position.set(0, 3.92, z);
      this.clubGroup.add(beam);

      for (let x = -4.2; x <= 4.2; x += 2.8) {
        const neonFixture = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.22), neonMat);
        neonFixture.position.set(x, 3.84, z);
        this.clubGroup.add(neonFixture);
      }
    }
  }

  addWallBanner(x, y, z, w, h, title, subtitle, accentHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 28, 256);
    ctx.fillRect(996, 0, 28, 256);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 1012, 244);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 66px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase(), 512, 125);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText(subtitle, 512, 195);

    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.position.set(x, y, z);
    this.clubGroup.add(mesh);
  }

  // Costruisce il Palco di Guida rialzato (0.90m da terra) e i piloti con radiocomando a volantino in mano!
  buildDriverStandAndPilots() {
    const standGroup = new THREE.Group();
    const standWidth = 4.6;
    const standDepth = 1.25;
    const standHeight = REAL_SCALE.STAND_HEIGHT; // 0.90m

    const deckMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75, roughness: 0.25 });
    const gripStripMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });

    // Struttura pedana palco (a z = 2.65m, bordo anteriore a z = 2.025m)
    const platform = new THREE.Mesh(new THREE.BoxGeometry(standWidth, standHeight, standDepth), deckMat);
    platform.position.set(0, standHeight / 2, 2.65);
    platform.receiveShadow = true;
    standGroup.add(platform);

    // Striscia gialla antiscivolo sul bordo del palco
    const safetyEdge = new THREE.Mesh(new THREE.BoxGeometry(standWidth, 0.02, 0.06), gripStripMat);
    safetyEdge.position.set(0, standHeight + 0.005, 2.06);
    standGroup.add(safetyEdge);

    // Ringhiera di protezione (alta 1.00m sopra la pedana = 1.90m da terra)
    const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, standWidth, 16), railMat);
    topRail.rotation.z = Math.PI / 2;
    topRail.position.set(0, standHeight + 0.98, 2.06);
    standGroup.add(topRail);

    const midRail = topRail.clone();
    midRail.position.y = standHeight + 0.52;
    standGroup.add(midRail);

    for (let x = -2.2; x <= 2.2; x += 1.1) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 12), railMat);
      post.position.set(x, standHeight + 0.50, 2.06);
      standGroup.add(post);
    }

    // Scaletta laterale per salire sul palco
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.28), deckMat);
      step.position.set(-2.72, (i + 1) * 0.22, 2.25 + i * 0.25);
      standGroup.add(step);
    }

    // Piloti sul palco accanto a te (altezza reale 1.75m sopra la pedana da 0.90m!)
    // Tu sei al centro (x = 0). Accanto a te a sinistra e a destra ci sono gli altri piloti col radiocomando in mano!
    const pilotConfigs = [
      { x: -1.08, z: 2.32, shirtColor: 0xdc2626, capColor: 0x111827, name: 'Marco' },
      { x:  1.08, z: 2.32, shirtColor: 0x0284c7, capColor: 0xeab308, name: 'Luca' },
      { x: -1.95, z: 2.38, shirtColor: 0x16a34a, capColor: 0xf8fafc, name: 'Davide' }
    ];

    for (const cfg of pilotConfigs) {
      const pilot = this.createHumanFigure({
        shirtColor: cfg.shirtColor,
        pantsColor: 0x1e293b,
        capColor: cfg.capColor,
        hasTransmitter: true,
        isSeated: false
      });
      pilot.group.position.set(cfg.x, standHeight, cfg.z);
      pilot.group.rotation.y = Math.PI; // Guarda verso -Z (la pista!)
      standGroup.add(pilot.group);
      this.standPilots.push(pilot);
    }

    this.clubGroup.add(standGroup);
  }

  // Crea un personaggio 3D in scala reale (1.75m in piedi, con radiocomando RC a volantino di 22cm!)
  createHumanFigure({ shirtColor = 0x2563eb, pantsColor = 0x1e293b, capColor = null, isMarshal = false, hasTransmitter = false, isSeated = false }) {
    const group = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: isMarshal ? 0xfacc15 : shirtColor,
      roughness: 0.55
    });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.7 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });

    if (isSeated) {
      // Personaggio seduto al banco da lavoro (sedia a 0.45m, altezza testa ~1.32m)
      const hipY = 0.46;
      const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.42), pantsMat);
      thighL.position.set(-0.10, hipY, 0.16);
      const thighR = thighL.clone();
      thighR.position.x = 0.10;

      const calfL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), pantsMat);
      calfL.position.set(-0.10, 0.22, 0.34);
      const calfR = calfL.clone();
      calfR.position.x = 0.10;

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.22), shirtMat);
      torso.position.set(0, hipY + 0.30, 0);
      torso.castShadow = true;

      const headGroup = new THREE.Group();
      headGroup.position.set(0, hipY + 0.66, 0.02);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), skinMat);
      headGroup.add(head);

      // Braccia appoggiate sul banchetto da lavoro che armeggiano sulla Mini-Z
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.44), shirtMat);
      armL.position.set(-0.22, hipY + 0.34, 0.22);
      armL.rotation.y = -0.22;
      const armR = armL.clone();
      armR.position.x = 0.22;
      armR.rotation.y = 0.22;

      group.add(thighL, thighR, calfL, calfR, torso, headGroup, armL, armR);
      return { group, headGroup, armL, armR };
    }

    // Personaggio in piedi (1.75m reali)
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.84, 12), pantsMat);
    legL.position.set(-0.10, 0.42, 0);
    const legR = legL.clone();
    legR.position.x = 0.10;

    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.26), shoeMat);
    shoeL.position.set(-0.10, 0.035, 0.04);
    const shoeR = shoeL.clone();
    shoeR.position.x = 0.10;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.58, 0.23), shirtMat);
    torso.position.set(0, 1.12, 0);
    torso.castShadow = true;

    // Se è un Commissario di pista, aggiunge le bande catarifrangenti della pettorina!
    if (isMarshal) {
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
      const vestBand1 = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.06, 0.24), stripeMat);
      vestBand1.position.set(0, 1.02, 0);
      const vestBand2 = vestBand1.clone();
      vestBand2.position.y = 1.22;
      group.add(vestBand1, vestBand2);
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.56, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), skinMat);
    headGroup.add(head);

    if (capColor !== null) {
      const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.5 });
      const capDome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      capDome.position.y = 0.02;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.12), capMat);
      visor.position.set(0, 0.03, 0.11);
      headGroup.add(capDome, visor);
    }

    const armL = new THREE.Group();
    armL.position.set(-0.24, 1.34, 0);
    const armMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.52, 10), shirtMat);
    armMeshL.position.set(0, -0.22, 0.12);
    armMeshL.rotation.x = hasTransmitter ? -0.95 : -0.2;
    armL.add(armMeshL);

    const armR = new THREE.Group();
    armR.position.set(0.24, 1.34, 0);
    const armMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.52, 10), shirtMat);
    armMeshR.position.set(0, -0.22, 0.12);
    armMeshR.rotation.x = hasTransmitter ? -0.95 : -0.2;
    armR.add(armMeshR);

    // Radiocomando a volantino in scala reale (22cm di altezza) tenuto tra le mani!
    let transmitterWheel = null;
    if (hasTransmitter) {
      const txGroup = new THREE.Group();
      const txBodyMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.5 });
      const txScreenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const txWheelMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, metalness: 0.8, roughness: 0.2 });

      // Impugnatura a pistola + corpo superiore con display LCD illuminato
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.05), txBodyMat);
      const topUnit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.16), txBodyMat);
      topUnit.position.set(0, 0.09, 0.03);
      const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.045), txScreenMat);
      lcdScreen.rotation.x = -Math.PI / 3;
      lcdScreen.position.set(0, 0.127, 0.01);

      // Volantino laterale dello sterzo (diametro 5.5 cm)
      transmitterWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.018, 16), txWheelMat);
      transmitterWheel.rotation.z = Math.PI / 2;
      transmitterWheel.position.set(-0.048, 0.085, 0.04);

      txGroup.add(handle, topUnit, lcdScreen, transmitterWheel);
      txGroup.position.set(0, 1.12, 0.34);
      group.add(txGroup);
    }

    group.add(legL, legR, shoeL, shoeR, torso, headGroup, armL, armR);
    return { group, headGroup, armL, armR, transmitterWheel };
  }

  // Costruisce la Console della Direzione Gara (Race Control) a bordo pista con monitor, semaforo e Telecronista al microfono
  buildRaceControlConsole() {
    const rcGroup = new THREE.Group();
    rcGroup.position.set(-4.35, 0, 1.25);
    rcGroup.rotation.y = Math.PI / 2.4;

    const deskMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });

    // Tavolo Regia (1.35m x 0.65m, altezza 0.75m)
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.04, 0.65), deskMat);
    deskTop.position.set(0, 0.75, 0);
    const deskFront = new THREE.Mesh(new THREE.BoxGeometry(1.33, 0.73, 0.04), skirtMat);
    deskFront.position.set(0, 0.365, 0.30);
    rcGroup.add(deskTop, deskFront);

    // Doppio Monitor Direzione Gara con schermata Live Timing
    const monScreenMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    for (const mx of [-0.32, 0.18]) {
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.025), darkMetal);
      monitor.position.set(mx, 0.93, 0.08);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.23), monScreenMat);
      screen.position.set(mx, 0.93, 0.066);
      screen.rotation.y = Math.PI;
      rcGroup.add(monitor, screen);
    }

    // Microfono da tavolo dello Speaker / Telecronista
    const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 12), darkMetal);
    micBase.position.set(-0.05, 0.78, -0.05);
    const micStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8), darkMetal);
    micStem.position.set(-0.05, 0.88, -0.08);
    micStem.rotation.x = 0.25;
    const micFoam = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.8 })
    );
    micFoam.position.set(-0.05, 0.98, -0.05);
    rcGroup.add(micBase, micStem, micFoam);

    // Colonna Semaforo Direzione Gara (Verde / Giallo / Rosso) + Cassa Audio PA
    const lightPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 12), darkMetal);
    lightPole.position.set(0.55, 1.42, 0.15);
    const greenLamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    greenLamp.position.set(0.55, 1.95, 0.15);
    const amberLamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    amberLamp.position.set(0.55, 1.82, 0.15);
    rcGroup.add(lightPole, greenLamp, amberLamp);

    // Il Direttore di Gara / Telecronista seduto alla console
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.45, 0.44), darkMetal);
    chair.position.set(-0.05, 0.225, -0.38);
    rcGroup.add(chair);

    this.raceDirector = this.createHumanFigure({
      shirtColor: 0x111827,
      pantsColor: 0x334155,
      capColor: 0xdc2626,
      isSeated: true
    });
    this.raceDirector.group.position.set(-0.05, 0, -0.42);
    rcGroup.add(this.raceDirector.group);

    this.clubGroup.add(rcGroup);
  }

  // Costruisce i Banchetti da Lavoro (Area Box) con meccanici/piloti seduti, tappetini, caricabatterie e Mini-Z di ricambio!
  buildPitWorkbenches() {
    const benchPositions = [
      { x: -5.35, z: -0.60, rotY: Math.PI / 2, shirt: 0x2563eb, carColor: 0xfacc15 },
      { x: -5.35, z: -2.35, rotY: Math.PI / 2, shirt: 0x16a34a, carColor: 0xef4444 },
      { x:  5.35, z: -0.60, rotY: -Math.PI / 2, shirt: 0x9333ea, carColor: 0x38bdf8 },
      { x:  5.35, z: -2.35, rotY: -Math.PI / 2, shirt: 0xea580c, carColor: 0x22c55e }
    ];

    const tableTopMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6, roughness: 0.4 });
    const pitMatBlue = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.7 });
    const chargerMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.3 });
    const lcdMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.85 });

    for (const bp of benchPositions) {
      const bGroup = new THREE.Group();
      bGroup.position.set(bp.x, 0, bp.z);
      bGroup.rotation.y = bp.rotY;

      // Piano del banchetto da lavoro (1.20m x 0.60m, alto 0.75m reali)
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(REAL_SCALE.TABLE_WIDTH, 0.035, REAL_SCALE.TABLE_DEPTH),
        tableTopMat
      );
      top.position.set(0, REAL_SCALE.TABLE_HEIGHT, 0);
      top.receiveShadow = true;
      top.castShadow = true;
      bGroup.add(top);

      // 4 Gambe del tavolo
      for (const lx of [-0.55, 0.55]) {
        for (const lz of [-0.25, 0.25]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, REAL_SCALE.TABLE_HEIGHT, 8), legMat);
          leg.position.set(lx, REAL_SCALE.TABLE_HEIGHT / 2, lz);
          bGroup.add(leg);
        }
      }

      // Tappetino da modellismo blu Kyosho (45cm x 30cm)
      const workMat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.004, 0.30), pitMatBlue);
      workMat.position.set(0, REAL_SCALE.TABLE_HEIGHT + 0.02, 0.06);
      bGroup.add(workMat);

      // Una Mini-Z in scala reale (17.2cm x 7.8cm!) appoggiata sopra il tappetino da lavoro!
      const pitCar = new THREE.Mesh(
        new THREE.BoxGeometry(0.078, 0.044, 0.172),
        new THREE.MeshStandardMaterial({ color: bp.carColor, roughness: 0.2, metalness: 0.3 })
      );
      pitCar.rotation.y = 0.35;
      pitCar.position.set(0.02, REAL_SCALE.TABLE_HEIGHT + 0.044, 0.06);
      bGroup.add(pitCar);

      // Caricabatterie digitale per batterie AAA Mini-Z (13cm x 10cm) con schermo acceso
      const charger = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.055, 0.10), chargerMat);
      charger.position.set(-0.36, REAL_SCALE.TABLE_HEIGHT + 0.045, -0.08);
      const chargerLcd = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), lcdMat);
      chargerLcd.rotation.x = -Math.PI / 3;
      chargerLcd.position.set(-0.36, REAL_SCALE.TABLE_HEIGHT + 0.074, -0.06);
      bGroup.add(charger, chargerLcd);

      // Colonnine di gomme di ricambio Mini-Z (diametro reale 2.5 cm!) e cassetta attrezzi
      const tireStack = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.06, 12), tireMat);
      tireStack.position.set(0.34, REAL_SCALE.TABLE_HEIGHT + 0.048, 0.05);
      const toolBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.11, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 })
      );
      toolBox.position.set(0.38, REAL_SCALE.TABLE_HEIGHT + 0.07, -0.12);
      bGroup.add(tireStack, toolBox);

      // Sgabello + Meccanico/Pilota seduto al banchetto
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 16), legMat);
      stool.position.set(0, 0.225, -0.42);
      bGroup.add(stool);

      const mech = this.createHumanFigure({
        shirtColor: bp.shirt,
        pantsColor: 0x1e293b,
        capColor: bp.carColor,
        isSeated: true
      });
      mech.group.position.set(0, 0, -0.42);
      bGroup.add(mech.group);
      this.pitMechanics.push(mech);

      this.clubGroup.add(bGroup);
    }
  }

  // Costruisce il tracciato RCP selezionato con cordoli, sponde morbide, ponte cronometraggio e Commissari
  buildTrack(trackId, reverse = false) {
    while (this.trackGroup.children.length > 0) {
      this.trackGroup.remove(this.trackGroup.children[0]);
    }
    this.marshals = [];

    const spec = TRACK_LAYOUTS.find((t) => t.id === trackId) || TRACK_LAYOUTS[0];
    this.activeTrackSpec = spec;

    const rawPoints = spec.waypoints.map((p) => new THREE.Vector3(p.x, 0, p.z));
    if (reverse) rawPoints.reverse();

    const curve = new THREE.CatmullRomCurve3(rawPoints, true, 'catmullrom', 0.42);
    const numSamples = 260;
    this.curveSamples = [];

    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      const pt = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tan.z, 0, tan.x); // Normale laterale nel piano XZ
      this.curveSamples.push({ t, pt, tan, normal });
    }

    // 1. Pedana di fondo del tappeto Kyosho RCP Track (7.0m x 4.6m) con griglia 50x50cm
    const baseMat = new THREE.MeshStandardMaterial({
      map: this.rcpTexture,
      color: spec.surfaceType === 'drift_carpet' ? 0x1e293b : 0x2b303c,
      roughness: spec.surfaceType === 'drift_carpet' ? 0.35 : 0.82
    });
    const rcpBase = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.014, 4.6), baseMat);
    rcpBase.position.set(0, -0.007, -0.05);
    rcpBase.receiveShadow = true;
    this.trackGroup.add(rcpBase);

    // 2. Nastro corsia stradale con gommatura centrale (Racing Line)
    const laneHalf = spec.laneWidth / 2;
    const roadMesh = this.createRibbonMesh(this.curveSamples, laneHalf, 0.002, spec.surfaceType);
    this.trackGroup.add(roadMesh);

    // 3. Sponde morbide RCP interne ed esterne (altezza reale 4.5 cm = 0.045m!) + Cordoli sugli angoli
    this.buildBarriersAndCurbs(this.curveSamples, laneHalf);

    // 4. Griglia di partenza + Ponte di Cronometraggio Luminoso sul rettilineo sotto il palco
    const bridgeIdx = Math.floor((spec.bridgeProgress || 0.08) * numSamples) % numSamples;
    const bridgeSample = this.curveSamples[bridgeIdx];
    this.buildTimingBridge(bridgeSample, spec.laneWidth);

    // 5. Commissari di Pista (Marshals) attorno al tappeto RCP
    for (const mp of spec.marshalPositions || []) {
      const marshal = this.createHumanFigure({
        isMarshal: true,
        pantsColor: 0x0f172a,
        capColor: 0xf97316
      });
      marshal.group.position.set(mp.x, 0, mp.z);
      marshal.group.lookAt(mp.lookAt.x, 0, mp.lookAt.z);
      this.trackGroup.add(marshal.group);
      this.marshals.push(marshal);
    }

    // Posizione iniziale sul rettilineo principale appena prima del ponte
    const startIdx = (bridgeIdx - 12 + numSamples) % numSamples;
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

  createRibbonMesh(samples, halfWidth, yOffset, surfaceType) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const n = samples.length;

    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const left = s.pt.clone().addScaledVector(s.normal, -halfWidth);
      const right = s.pt.clone().addScaledVector(s.normal, halfWidth);

      positions.push(left.x, yOffset, left.z);
      positions.push(right.x, yOffset, right.z);

      const v = (i / n) * 28;
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

    // Texture della corsia con la traccia scura gommata al centro e le righe bianche laterali
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = surfaceType === 'drift_carpet' ? '#172033' : '#2d3340';
    ctx.fillRect(0, 0, 256, 256);

    // Gommatura centrale più scura (Racing groove)
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(0.2, 'rgba(0,0,0,0.0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.26)');
    grad.addColorStop(0.8, 'rgba(0,0,0,0.0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Linee bianche/azzurre di margine corsia
    ctx.fillStyle = surfaceType === 'drift_carpet' ? '#38bdf8' : '#e2e8f0';
    ctx.fillRect(6, 0, 6, 256);
    ctx.fillRect(244, 0, 6, 256);

    // Giuntura ogni 50cm delle mattonelle RCP
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();

    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: surfaceType === 'drift_carpet' ? 0.35 : 0.78
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  buildBarriersAndCurbs(samples, halfWidth) {
    const barrierHeight = REAL_SCALE.BARRIER_HEIGHT; // 4.5 cm reali!
    const barrierThickness = 0.042; // 4.2 cm spessore sponda RCP
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
    const darkFoamMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });

    const n = samples.length;
    const step = 2;

    for (let i = 0; i < n; i += step) {
      const s0 = samples[i];
      const s1 = samples[(i + step) % n];
      const segLen = s0.pt.distanceTo(s1.pt) * 1.04;
      const mid = s0.pt.clone().add(s1.pt).multiplyScalar(0.5);
      const angle = Math.atan2(s1.pt.x - s0.pt.x, s1.pt.z - s0.pt.z);

      // Calcola curvatura locale per disegnare i cordoli bianchi/rossi sulle curve!
      const curvature = s0.tan.angleTo(s1.tan);
      const isCorner = curvature > 0.032;

      const matChoice = (i / step) % 2 === 0 ? redMat : whiteMat;
      const wallMat = isCorner ? matChoice : (i / step) % 4 === 0 ? whiteMat : darkFoamMat;

      // Sponda sinistra e destra
      for (const side of [-1, 1]) {
        const offset = halfWidth + barrierThickness * 0.5;
        const bx = mid.x + s0.normal.x * side * offset;
        const bz = mid.z + s0.normal.z * side * offset;

        const block = new THREE.Mesh(
          new THREE.BoxGeometry(barrierThickness, barrierHeight, segLen),
          wallMat
        );
        block.position.set(bx, barrierHeight / 2, bz);
        block.rotation.y = angle;
        block.castShadow = true;
        block.receiveShadow = true;
        this.trackGroup.add(block);

        // Cordolo ribassato interno (alto 1.1 cm, largo 4.5 cm) nelle curve!
        if (isCorner) {
          const curbOffset = halfWidth - 0.022;
          const cx = mid.x + s0.normal.x * side * curbOffset;
          const cz = mid.z + s0.normal.z * side * curbOffset;
          const curb = new THREE.Mesh(
            new THREE.BoxGeometry(0.045, 0.011, segLen),
            matChoice
          );
          curb.position.set(cx, 0.0055, cz);
          curb.rotation.y = angle;
          this.trackGroup.add(curb);
        }
      }
    }
  }

  // Costruisce il Ponte di Cronometraggio (Kyosho IC-Tag Bridge) con tabellone LED aggiornabile in tempo reale!
  buildTimingBridge(sample, laneWidth) {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(sample.pt.x, 0, sample.pt.z);
    bridgeGroup.rotation.y = Math.atan2(sample.tan.x, sample.tan.z);

    // Striscia a scacchi bianchi e neri sul tappeto RCP sotto il ponte
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
      new THREE.PlaneGeometry(laneWidth, 0.18),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(checkerCanvas) })
    );
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.y = 0.0035;
    bridgeGroup.add(finishLine);

    // Pilastri e traversa del ponte (altezza reale 36 cm, larghezza corsia + 14 cm)
    const span = laneWidth + 0.14;
    const height = 0.36;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.3 });
    const topBoxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.6 });

    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.055, height, 0.08), pillarMat);
    leftPillar.position.set(-span / 2, height / 2, 0);
    const rightPillar = leftPillar.clone();
    rightPillar.position.x = span / 2;

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(span + 0.08, 0.11, 0.09), topBoxMat);
    crossbar.position.set(0, height + 0.03, 0);

    // Display LED luminoso sul ponte rivolto verso il Palco di Guida!
    this.bridgeScreenCanvas = document.createElement('canvas');
    this.bridgeScreenCanvas.width = 512;
    this.bridgeScreenCanvas.height = 96;
    this.bridgeScreenCtx = this.bridgeScreenCanvas.getContext('2d');
    this.bridgeScreenTex = new THREE.CanvasTexture(this.bridgeScreenCanvas);
    this.updateBridgeDisplay(0, null, null);

    const screenMeshFront = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 0.88, 0.095),
      new THREE.MeshBasicMaterial({ map: this.bridgeScreenTex })
    );
    screenMeshFront.position.set(0, height + 0.03, 0.047);

    const screenMeshBack = screenMeshFront.clone();
    screenMeshBack.position.z = -0.047;
    screenMeshBack.rotation.y = Math.PI;

    bridgeGroup.add(leftPillar, rightPillar, crossbar, screenMeshFront, screenMeshBack);
    this.trackGroup.add(bridgeGroup);
  }

  updateBridgeDisplay(lapCount, lastLapSec, bestLapSec) {
    if (!this.bridgeScreenCtx || !this.bridgeScreenTex) return;
    const ctx = this.bridgeScreenCtx;
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 92);

    const fmt = (t) => (t ? `${t.toFixed(2)}s` : '--.--s');

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 28px Consolas, monospace';
    ctx.fillText(`GIRO: ${lapCount}`, 22, 42);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`ULTIMO: ${fmt(lastLapSec)}`, 165, 42);

    ctx.fillStyle = '#22c55e';
    ctx.fillText(`RECORD: ${fmt(bestLapSec)}`, 22, 80);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.fillText('KYOSHO IC-TAG', 325, 80);

    this.bridgeScreenTex.needsUpdate = true;
  }

  // Controlla collisioni con le sponde morbide RCP e se le ruote sono sui cordoli
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
    const onCurb = Math.abs(lateralOffset) > maxOffset - 0.048;

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

  // Rileva il passaggio sotto il ponte di cronometraggio Kyosho IC-Tag
  checkLapCrossing(x, z, bridgeSample) {
    const dx = x - bridgeSample.pt.x;
    const dz = z - bridgeSample.pt.z;
    const distSq = dx * dx + dz * dz;

    // Se l'auto è lontana dal ponte (nella parte opposta della pista), arma il conteggio giro
    if (distSq > 2.2) {
      this.lapArmed = true;
    }

    if (distSq < 0.38) {
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

  // Trova il punto della pista più vicino per quando il Commissario rimette dritta la Mini-Z
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

  // Anima la testa dei piloti sul palco (e il volantino del loro radiocomando!), dei commissari, dei meccanici ai box e del telecronista
  animateCharacters(timeSec, carPos, isSpeaking) {
    // 1. Piloti sul palco: guardano la Mini-Z in pista e muovono il volantino del radiocomando!
    for (let i = 0; i < this.standPilots.length; i++) {
      const p = this.standPilots[i];
      const dx = carPos.x - p.group.position.x;
      const dz = carPos.z - 2.32;
      const targetYaw = clamp(Math.atan2(-dx, -dz) * 0.55, -0.65, 0.65);
      p.headGroup.rotation.y = targetYaw;
      p.headGroup.rotation.x = 0.28; // Inclinata leggermente in basso verso la pista

      if (p.transmitterWheel) {
        p.transmitterWheel.rotation.x = Math.sin(timeSec * 6.5 + i * 2.1) * 0.45;
      }
    }

    // 2. Commissari di pista: seguono la Mini-Z con lo sguardo
    for (const m of this.marshals) {
      const dx = carPos.x - m.group.position.x;
      const dz = carPos.z - m.group.position.z;
      const worldAngle = Math.atan2(dx, dz);
      let relYaw = worldAngle - m.group.rotation.y;
      while (relYaw > Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      m.headGroup.rotation.y = clamp(relYaw * 0.6, -0.75, 0.75);
      m.headGroup.rotation.x = 0.22;
    }

    // 3. Meccanici seduti ai banchetti da lavoro: lavorano con le braccia sulle Mini-Z ai box
    for (let i = 0; i < this.pitMechanics.length; i++) {
      const mech = this.pitMechanics[i];
      mech.headGroup.rotation.x = 0.32 + Math.sin(timeSec * 2.0 + i) * 0.05;
      mech.headGroup.rotation.y = Math.sin(timeSec * 1.3 + i * 1.7) * 0.18;
      mech.armL.rotation.x = Math.sin(timeSec * 4.2 + i) * 0.08;
      mech.armR.rotation.x = -Math.sin(timeSec * 4.2 + i) * 0.08;
    }

    // 4. Direttore di Gara / Telecronista: si muove al microfono mentre parla in telecronaca!
    if (this.raceDirector) {
      if (isSpeaking) {
        this.raceDirector.headGroup.rotation.x = Math.sin(timeSec * 12) * 0.08;
        this.raceDirector.headGroup.rotation.y = Math.sin(timeSec * 5) * 0.15;
      } else {
        this.raceDirector.headGroup.rotation.x = 0.1;
        this.raceDirector.headGroup.rotation.y = 0;
      }
    }
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
