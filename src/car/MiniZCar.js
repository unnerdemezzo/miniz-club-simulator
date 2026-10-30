import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glbAxleCenters, prepareHypercarBody, visibleMeshBox } from './hypercar-body.js';
import {
  REAL_SCALE,
  CAR_BODIES,
  CHASSIS_LIST,
  FRONT_TIRES,
  REAR_TIRES,
  MOTORS,
  PINIONS,
  FRONT_SPRINGS,
  T_PLATES,
  DIFFERENTIALS
} from '../data/parts.js';
import { TRACK_Y } from '../club/config.js';
import { buildMR04Chassis } from './mr04-chassis.js';

export class MiniZCar {
  constructor(scene, onLoadProgress) {
    this.scene = scene;
    this.onLoadProgress = onLoadProgress;
    this.loader = new GLTFLoader();
    this.glbCache = new Map();

    // Gruppo principale che si muove sulla pista (y = 0 è il livello del tappeto RCP)
    this.rootGroup = new THREE.Group();
    // Gruppo sospeso che subisce rollio (curva) e beccheggio (frenata/gas)
    this.sprungGroup = new THREE.Group();
    this.rootGroup.add(this.sprungGroup);

    // Sottogruppi per Telaio Meccanico, Carrozzeria e Luci procedurali
    this.chassisGroup = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.proceduralLightsGroup = new THREE.Group();
    this.sprungGroup.add(this.chassisGroup);
    this.sprungGroup.add(this.bodyGroup);
    this.sprungGroup.add(this.proceduralLightsGroup);

    this.scene.add(this.rootGroup);

    // Riferimenti per parti dinamiche del telaio e delle ruote
    this.springMeshes = [];
    this.motorCanMesh = null;
    this.chassisWheelMeshes = { lf: null, rf: null, lr: null, rr: null };
    this.glbWheelNodes = { lf: [], rf: [], lr: [], rr: [], steerLf: [], steerRf: [] };
    this.brakeLightMaterials = [];

    // Stato fisico in scala reale (metri, radianti, m/s)
    this.state = {
      x: 2.45,
      y: 0.014,
      z: 0.35,
      vx: 0,
      vz: 0,
      speed: 0,
      lateralSpeed: 0,
      heading: Math.PI / 2, // Punta verso +X lungo il rettilineo principale sotto il palco
      angularVel: 0,
      steerAngle: 0,
      wheelSpin: 0,
      roll: 0,
      pitch: 0,
      braking: false,
      slipAmount: 0,
      isFlipped: false,
      flipTimer: 0,
      // Telemetria Simulatore Reale: Batterie 4xAAA NiMH (800mAh) e Gomme Urethane/Radial (Temperatura & Usura)
      batteryPct: 100.0,
      batteryVoltage: 5.58,
      tireWearPct: 100.0,
      tireTempC: 23.0,
      tireGripFactor: 0.94
    };

    this.onWorkbench = false;
    // Posizione sul supporto del banco lavoro (aggiornata dalla sala con le coordinate reali del banco)
    this.workbenchPose = { x: -5.05, y: 0.1052, z: -2.77, heading: 0, shellY: 0.0822 };
    this.currentSetup = null;
    // Il piano del tappeto RCP coincide con il piano pista della sala (TRACK_Y) + spessore mattonelle (8 mm)
    this.trackSurfaceY = TRACK_Y;
    this.state.y = this.trackSurfaceY + 0.008;
    // Passo del telaio montato: 98 mm per le Hypercar, quello della carrozzeria per le GT3 (vedi CAR_BODIES)
    this.wheelbase = REAL_SCALE.WHEELBASE;
    this.buildDetailedChassis3D();
    this.buildLights3D();
    this.buildHeadlightBeamsAndSkids();
    this.buildContactShadow();
  }

  // Ombra di contatto morbida sotto il telaio: tiene l'auto "appoggiata" sul tappeto anche
  // dove la shadow map della sala è troppo grossolana (o spenta in qualità Bassa)
  buildContactShadow() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 128, 6, 64, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.38)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(64, 128);
    g.scale(0.5, 1);
    g.translate(-64, -128);
    g.fillStyle = gr;
    g.fillRect(-64, 0, 256, 256);
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 });
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.22), mat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.0006;
    this.contactShadow.renderOrder = 1;
    this.rootGroup.add(this.contactShadow);
  }

  // Nessun segno nero o cono finto sulla pista (tappeto RCP sempre pulito!)
  buildHeadlightBeamsAndSkids() {
    this.beamGroup = new THREE.Group();
    this.rearBrakeGlow = null;
    this.skidPool = null;
  }

  // Costruisce il vero telaio Kyosho Mini-Z MR-04 EVO2 (vasca, 4 celle AAA, scheda ICS, kingpin, motore, differenziale, ruote a razze)
  buildDetailedChassis3D() {
    while (this.chassisGroup.children.length > 0) this.chassisGroup.remove(this.chassisGroup.children[0]);
    const built = buildMR04Chassis({
      wheelbase: this.wheelbase,
      wheelRadius: REAL_SCALE.WHEEL_RADIUS,
      halfTrack: 0.033
    });
    this.chassisGroup.add(built.group);
    this.springMeshes = [built.springMesh];
    this.motorCanMesh = built.motorCan;
    this.chassisWheelMeshes.lf = built.wheels.lf;
    this.chassisWheelMeshes.rf = built.wheels.rf;
    this.chassisWheelMeshes.lr = built.wheels.lr;
    this.chassisWheelMeshes.rr = built.wheels.rr;
  }

  buildLights3D() {
    // Fari anteriori LED + Fari posteriori stop rossi
    const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const brakeMat1 = new THREE.MeshBasicMaterial({ color: 0x660000 });
    const brakeMat2 = new THREE.MeshBasicMaterial({ color: 0x660000 });
    this.brakeLightMaterials = [brakeMat1, brakeMat2];

    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0035, 0.003), headLightMat);
    fl.position.set(0.025, 0.018, 0.084);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0035, 0.003), headLightMat);
    fr.position.set(-0.025, 0.018, 0.084);

    // Strip LED posteriore stile Ferrari 499P Hypercar!
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0028, 0.003), brakeMat1);
    rl.position.set(0.018, 0.024, -0.085);
    const rr = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0028, 0.003), brakeMat2);
    rr.position.set(-0.018, 0.024, -0.085);

    this.proceduralLightsGroup.add(fl, fr, rl, rr);
  }

  async applySetup(setup) {
    this.currentSetup = { ...setup };

    // 1. Aggiorna colori visivi di Molle e Cassa Motore sul telaio 3D
    this.applySpringAndMotorColors();

    // 2. Carica o aggiorna la Carrozzeria 3D selezionata
    await this.loadCarBody(setup.bodyId, setup.customBodyColor, setup.showNakedChassis);
  }

  applySpringAndMotorColors() {
    const setup = this.currentSetup;
    if (!setup) return;
    const springSpec = FRONT_SPRINGS.find((s) => s.id === setup.frontSpringId) || FRONT_SPRINGS[1];
    for (const sm of this.springMeshes) {
      sm.material.color.set(springSpec.colorHex);
    }

    const motorSpec = MOTORS.find((m) => m.id === setup.motorId) || MOTORS[2];
    if (this.motorCanMesh) {
      this.motorCanMesh.material.color.set(motorSpec.colorHex);
    }
  }

  async loadCarBody(bodyId, customColorHex, showNakedChassis) {
    // Pulisce il bodyGroup attuale
    while (this.bodyGroup.children.length > 0) {
      this.bodyGroup.remove(this.bodyGroup.children[0]);
    }
    this.glbWheelNodes = { lf: [], rf: [], lr: [], rr: [], steerLf: [], steerRf: [] };

    const bodySpec = CAR_BODIES.find((b) => b.id === bodyId) || CAR_BODIES[0];
    this.bodyId = bodySpec.id;

    // Ogni carrozzeria va sul passo Mini-Z per cui è fatta: se cambia, si sposta il pod motore (telaio ricostruito)
    const wheelbase = (bodySpec.wheelbaseMm || REAL_SCALE.WHEELBASE * 1000) / 1000;
    if (Math.abs(wheelbase - this.wheelbase) > 1e-6) {
      this.wheelbase = wheelbase;
      this.buildDetailedChassis3D();
      this.applySpringAndMotorColors();
    }

    if (bodySpec.glbUrl) {
      try {
        const gltfScene = await this.fetchGlbModel(bodySpec.glbUrl);
        const clone = gltfScene.clone(true);

        prepareHypercarBody(clone, { keepAllParts: bodySpec.category === 'gt3' });

        // Calcola il Bounding Box reale solo sui mesh VISIBILI del modello .glb per ridimensionarlo esattamente a 17.2 cm
        const box = visibleMeshBox(clone);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        // Determina la dimensione longitudinale massima e scala a REAL_SCALE.CAR_LENGTH (0.172m = 17.2cm)
        const targetLength = (bodySpec.lengthCm || 17.2) / 100;
        const maxHorizontal = Math.max(size.z, size.x, 0.001);
        const scaleFactor = targetLength / maxHorizontal;

        const wrapper = new THREE.Group();
        clone.scale.setScalar(scaleFactor);

        // Se il modello è orientato lungo X invece che lungo Z (es. le GT3 di Slot-Car, muso verso +X),
        // lo ruota di -90° così il muso va verso +Z
        if (size.x > size.z * 1.15) {
          clone.rotation.y = -Math.PI / 2;
        }

        // Carrozzerie con passo dichiarato (GT3): scala in modo che gli assi del modello cadano sugli assi del telaio
        const axles = bodySpec.wheelbaseMm ? glbAxleCenters(clone) : null;
        if (axles) clone.scale.multiplyScalar(wheelbase / axles.front.distanceTo(axles.rear));

        const scaledBox = visibleMeshBox(clone);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);
        if (axles) {
          // Centro tra i due assi (come il telaio MR-04) invece del centro del bounding box
          const scaledAxles = glbAxleCenters(clone);
          scaledCenter.copy(scaledAxles.front).add(scaledAxles.rear).multiplyScalar(0.5);
        }

        // Centra in X e Z, e appoggia esattamente il fondo delle gomme a y = 0!
        clone.position.x -= scaledCenter.x;
        clone.position.z -= scaledCenter.z;
        clone.position.y -= scaledBox.min.y;

        wrapper.add(clone);
        wrapper.updateMatrixWorld(true);

        // Impernia ciascuna delle 4 ruote del modello GLB esattamente sul proprio mozzo (hubCenter),
        // così sterzano e ruotano sul posto senza mai orbitare attorno al centro dell'auto!
        const rawWheels = { lf: null, rf: null, lr: null, rr: null };
        clone.traverse((node) => {
          const n = node.name || '';
          if (!rawWheels.lf && /^(WHEEL_LF(_\d+)?|WheelFL)$/i.test(n)) rawWheels.lf = node;
          else if (!rawWheels.rf && /^(WHEEL_RF(_\d+)?|WheelFR)$/i.test(n)) rawWheels.rf = node;
          else if (!rawWheels.lr && /^(WHEEL_LR(_\d+)?|WheelRL)$/i.test(n)) rawWheels.lr = node;
          else if (!rawWheels.rr && /^(WHEEL_RR(_\d+)?|WheelRR)$/i.test(n)) rawWheels.rr = node;
        });

        for (const [key, wheelNode] of Object.entries(rawWheels)) {
          if (!wheelNode) continue;
          const wBox = new THREE.Box3().setFromObject(wheelNode);
          if (wBox.isEmpty()) continue;
          const hubCenter = wBox.getCenter(new THREE.Vector3());

          const steerPivot = new THREE.Group();
          steerPivot.position.copy(hubCenter);
          const spinPivot = new THREE.Group();
          steerPivot.add(spinPivot);
          wrapper.add(steerPivot);
          wrapper.updateMatrixWorld(true);

          spinPivot.attach(wheelNode);
          this.glbWheelNodes[key].push({ steerPivot, spinPivot });
        }

        this.bodyGroup.add(wrapper);

        // Se il modello GLB ha già le sue ruote 3D (come la Ferrari 499P), mostra le ruote del telaio solo a carrozzeria smontata!
        const hasGlbWheels = this.glbWheelNodes.lf.length > 0;
        this.setChassisWheelsVisible(showNakedChassis || !hasGlbWheels);
      } catch (err) {
        console.warn('Errore caricamento GLB, uso carrozzeria procedurale:', err);
        this.buildProceduralBody(bodySpec, customColorHex);
        this.setChassisWheelsVisible(true);
      }
    } else {
      this.buildProceduralBody(bodySpec, customColorHex);
      this.setChassisWheelsVisible(true);
    }

    this.setNakedChassisMode(showNakedChassis);
  }

  // Permette anche all'utente di caricare qualsiasi nuovo file .glb direttamente dal PC!
  async loadCustomGlbFile(file) {
    const objectUrl = URL.createObjectURL(file);
    const customId = `custom_${Date.now()}`;
    const cleanName = file.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ');
    CAR_BODIES.unshift({
      id: customId,
      name: `${cleanName} (Modello 3D Utente)`,
      scaleLabel: 'Scala 1:27 • 17,2 cm × 7,8 cm (Auto-Calibrato)',
      lengthCm: 17.2,
      widthCm: 7.8,
      heightCm: 4.6,
      glbUrl: objectUrl,
      defaultColor: '#e11d48',
      aeroBonus: 1.12,
      weightBias: 1.0,
      description: 'Carrozzeria 3D caricata dal tuo computer e calibrata automaticamente alle misure reali Mini-Z.'
    });
    return customId;
  }

  fetchGlbModel(url) {
    if (this.glbCache.has(url)) {
      if (this.onLoadProgress) this.onLoadProgress(100);
      return Promise.resolve(this.glbCache.get(url));
    }
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.glbCache.set(url, gltf.scene);
          if (this.onLoadProgress) this.onLoadProgress(100);
          resolve(gltf.scene);
        },
        (xhr) => {
          if (xhr.total > 0 && this.onLoadProgress) {
            const pct = Math.min(99, Math.round((xhr.loaded / xhr.total) * 100));
            this.onLoadProgress(pct);
          }
        },
        (err) => reject(err)
      );
    });
  }

  buildProceduralBody(bodySpec, customColorHex) {
    const g = new THREE.Group();
    const color = new THREE.Color(customColorHex || bodySpec.defaultColor || '#e11d48');
    const paintMat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.18,
      metalness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85
    });
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });

    // Scocca inferiore (17.0 cm x 7.6 cm)
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.020, 0.168), paintMat);
    lowerBody.position.set(0, 0.020, 0);
    lowerBody.castShadow = true;
    g.add(lowerBody);

    // Muso aerodinamico
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.012, 0.036), paintMat);
    nose.position.set(0, 0.014, 0.072);
    nose.rotation.x = 0.18;
    g.add(nose);

    // Abitacolo / Cupolino
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.018, 0.078), glassMat);
    cabin.position.set(0, 0.035, -0.005);
    g.add(cabin);

    // Alettone posteriore GT in carbonio
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.003, 0.018), carbonMat);
    wingBlade.position.set(0, 0.044, -0.076);
    wingBlade.rotation.x = -0.15;
    const wingPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.012), carbonMat);
    wingPillarL.position.set(0.022, 0.036, -0.075);
    const wingPillarR = wingPillarL.clone();
    wingPillarR.position.x = -0.022;
    g.add(wingBlade, wingPillarL, wingPillarR);

    this.bodyGroup.add(g);
  }

  setChassisWheelsVisible(visible) {
    Object.values(this.chassisWheelMeshes).forEach((w) => {
      if (w) w.visible = visible;
    });
  }

  setNakedChassisMode(showNaked) {
    if (this.currentSetup) this.currentSetup.showNakedChassis = showNaked;
    const hasGlbWheels = this.glbWheelNodes.lf.length > 0;
    if (showNaked) {
      // Sul Banco Lavoro: appoggia la carrozzeria 3D (senza ruote) sul tappetino davanti al telaio nudo, ben visibile e senza essere coperta dal menu a destra!
      if (this.onWorkbench) {
        const pose = this.workbenchPose;
        this.bodyGroup.visible = true;
        this.bodyGroup.position.set(0.078, (pose.shellY ?? pose.y) - pose.y, 0.048);
        this.bodyGroup.rotation.set(0, -0.14, 0);
        this.setGlbWheelsVisible(false);
      } else {
        this.bodyGroup.visible = false;
        this.bodyGroup.position.set(0, 0, 0);
        this.bodyGroup.rotation.set(0, 0, 0);
        this.setGlbWheelsVisible(true);
      }
      this.chassisGroup.visible = true;
      this.proceduralLightsGroup.visible = false;
      this.setChassisWheelsVisible(true);
    } else {
      // Con la carrozzeria montata, nasconde il telaio interno così le batterie AAA non sporgono mai dal cofano/tetto!
      this.bodyGroup.visible = true;
      this.bodyGroup.position.set(0, 0, 0);
      this.bodyGroup.rotation.set(0, 0, 0);
      this.setGlbWheelsVisible(true);
      this.chassisGroup.visible = !hasGlbWheels;
      this.proceduralLightsGroup.visible = !hasGlbWheels;
      this.setChassisWheelsVisible(!hasGlbWheels);
    }
  }

  setGlbWheelsVisible(visible) {
    for (const key of ['lf', 'rf', 'lr', 'rr']) {
      for (const w of this.glbWheelNodes[key] || []) w.steerPivot.visible = visible;
    }
  }

  setWorkbenchMode(active, benchPose = null) {
    this.onWorkbench = Boolean(active);
    if (benchPose) this.workbenchPose = { ...this.workbenchPose, ...benchPose };
    if (this.beamGroup) this.beamGroup.visible = !this.onWorkbench;
    if (this.contactShadow) this.contactShadow.visible = !this.onWorkbench;
    this.setNakedChassisMode(Boolean(this.currentSetup?.showNakedChassis));
    this.syncVisuals(0.016);
  }

  refillBatteries() {
    this.state.batteryPct = 100.0;
    this.state.batteryVoltage = 5.60;
  }

  replaceTires() {
    this.state.tireWearPct = 100.0;
    this.state.tireTempC = 24.0;
    this.state.tireGripFactor = 0.95;
  }

  resetOnTrack(x, z, heading) {
    this.state.x = x;
    this.state.y = this.trackSurfaceY + 0.008;
    this.state.z = z;
    this.state.vx = 0;
    this.state.vz = 0;
    this.state.speed = 0;
    this.state.lateralSpeed = 0;
    this.state.heading = heading;
    this.state.angularVel = 0;
    this.state.steerAngle = 0;
    this.state.wheelSpin = 0;
    this.state.roll = 0;
    this.state.pitch = 0;
    this.state.isFlipped = false;
    this.state.flipTimer = 0;
    this.state.escBrakeUsed = false;
    this.state.escReverseArmed = false;
    this.state.escNeutralTime = 0;
    this.syncVisuals(0.016);
  }

  // Passo fisico in tempo reale (calcolato a 120Hz interni per massima precisione sulle sponde RCP)
  updatePhysics(dt, input, trackData, onWallHit, onGripRollFlip) {
    if (!this.currentSetup) return;

    const bodySpec = CAR_BODIES.find((b) => b.id === this.currentSetup.bodyId) || CAR_BODIES[0];
    const chassis = CHASSIS_LIST.find((c) => c.id === this.currentSetup.chassisId) || CHASSIS_LIST[0];
    const frontTire = FRONT_TIRES.find((t) => t.id === this.currentSetup.frontTireId) || FRONT_TIRES[1];
    const rearTire = REAR_TIRES.find((t) => t.id === this.currentSetup.rearTireId) || REAR_TIRES[0];
    const motor = MOTORS.find((m) => m.id === this.currentSetup.motorId) || MOTORS[2];
    const pinion = PINIONS.find((p) => p.id === this.currentSetup.pinionId) || PINIONS[1];
    const frontSpring = FRONT_SPRINGS.find((s) => s.id === this.currentSetup.frontSpringId) || FRONT_SPRINGS[1];
    const tPlate = T_PLATES.find((t) => t.id === this.currentSetup.tPlateId) || T_PLATES[1];
    const diff = DIFFERENTIALS.find((d) => d.id === this.currentSetup.diffId) || DIFFERENTIALS[0];

    // Se l'auto si è cappottata su un cordolo, attende l'intervento del Commissario (1.4 secondi)
    if (this.state.isFlipped) {
      this.state.flipTimer -= dt;
      this.state.vx *= 0.92;
      this.state.vz *= 0.92;
      this.state.x += this.state.vx * dt;
      this.state.z += this.state.vz * dt;
      this.state.roll = Math.min(Math.PI * 0.88, this.state.roll + dt * 6.5);
      if (this.state.flipTimer <= 0) {
        this.state.isFlipped = false;
        this.state.roll = 0;
        this.state.pitch = 0;
        this.state.vx = 0;
        this.state.vz = 0;
      }
      this.syncVisuals(dt);
      return;
    }

    const trackGrip = trackData?.gripMultiplier ?? 1.0;


    // Direzione longitudinale e laterale dell'auto
    const fwdX = Math.sin(this.state.heading);
    const fwdZ = Math.cos(this.state.heading);
    const rightX = fwdZ;
    const rightZ = -fwdX;

    // Scomposizione velocità nel sistema di riferimento della Mini-Z
    let vForward = this.state.vx * fwdX + this.state.vz * fwdZ;
    let vLateral = this.state.vx * rightX + this.state.vz * rightZ;

    // Velocità massima e accelerazione reali in scala 1:27 dal motore + pignone
    const topSpeed = motor.maxSpeedMs * pinion.speedMult * (bodySpec.aeroBonus ? 1 + (bodySpec.aeroBonus - 1) * 0.18 : 1);
    const maxAccel = motor.accelMs2 * pinion.accelMult;
    const drag = (1.65 * motor.motorBrake + Math.abs(vForward) * 0.42) * rearTire.dragFactor;

    // Calcolo tenuta laterale (Gomme Anteriori + Posteriori + Telaio RWD/AWD + Molle + T-Plate)
    const isDriftSetup = frontTire.id === 'front_drift_lf' || rearTire.id === 'rear_drift_lf';
    const frontGrip = frontTire.gripFront * chassis.turnInFactor * frontSpring.turnInBoost * trackGrip;
    const rearGrip = rearTire.gripRear * tPlate.exitTraction * diff.tractionStab * trackGrip;

    // GESTIONE PROPORZIONALE ESC KYOSHO ICS (Il grilletto regola con fluidità la coppia e la velocità target, MAI on/off!)
    this.state.braking = input.brake > 0.05 && vForward > 0.08;
    let driveAccel = 0;

    const thr = clamp(input.throttle, 0, 1);
    const brk = clamp(input.brake, 0, 1);

    // 1. SIMULAZIONE REALE BATTERIE 4xAAA NiMH (800mAh Speed House):
    const motorPowerDraw = (motor.maxSpeedMs / 5.0) * (0.035 + 0.20 * thr * thr);
    this.state.batteryPct = Math.max(0, (this.state.batteryPct ?? 100) - motorPowerDraw * dt);
    const soc = this.state.batteryPct / 100;
    const openCircuitV = 4.10 + 0.85 * Math.pow(soc, 0.45) + 0.65 * Math.pow(soc, 3.2);
    const internalResSag = thr * (0.14 + (1 - soc) * 0.22);
    this.state.batteryVoltage = Math.max(3.9, openCircuitV - internalResSag);
    const batteryPowerFactor = clamp(this.state.batteryVoltage / 5.15, 0.68, 1.04);

    // 2. SIMULAZIONE REALE GOMME (Temperatura d'esercizio 22°C-60°C & Usura mescola Shore 20°/30°/40°):
    const compoundWearMult = frontTire.id.includes('20') ? 1.75 : frontTire.id.includes('40') ? 0.55 : 1.0;
    const cornerEnergy = Math.abs(vLateral) * 1.4 + Math.abs(this.state.angularVel * vForward) * 0.35;
    const tireWearRate = (0.012 * Math.abs(vForward) + 0.065 * cornerEnergy) * compoundWearMult;
    if (Math.abs(vForward) > 0.1) {
      this.state.tireWearPct = Math.max(0, (this.state.tireWearPct ?? 100) - tireWearRate * dt);
    }
    const ambientTemp = 23.0;
    const heatGain = (cornerEnergy * 2.1 + thr * Math.abs(vForward) * 0.30) * compoundWearMult;
    const cooling = ((this.state.tireTempC ?? 23) - ambientTemp) * (0.12 + Math.abs(vForward) * 0.04);
    this.state.tireTempC = clamp((this.state.tireTempC ?? 23) + (heatGain - cooling) * dt, 22.0, 68.0);

    let thermalGrip = 1.0;
    if (this.state.tireTempC < 34) {
      thermalGrip = 0.90 + 0.10 * ((this.state.tireTempC - 22) / 12);
    } else if (this.state.tireTempC > 48) {
      thermalGrip = Math.max(0.84, 1.0 - (this.state.tireTempC - 48) * 0.010);
    }
    const wearGrip = this.state.tireWearPct > 35 ? 1.0 : 0.70 + 0.30 * (this.state.tireWearPct / 35);
    this.state.tireGripFactor = thermalGrip * wearGrip;

    const effectiveTopSpeed = topSpeed * batteryPowerFactor;
    const effectiveMaxAccel = maxAccel * batteryPowerFactor * this.state.tireGripFactor;

    // ESC Kyosho: freno → neutro → freno di nuovo = retromarcia. Il freno tenuto da fermo resta freno;
    // la retro si arma solo dopo un passaggio dal neutro (grilletto rilasciato) e si disarma col gas.
    if (thr > 0.008) {
      this.state.escBrakeUsed = false;
      this.state.escReverseArmed = false;
      this.state.escNeutralTime = 0;
    } else if (brk > 0.008) {
      this.state.escNeutralTime = 0;
      if (!this.state.escReverseArmed) this.state.escBrakeUsed = true;
    } else {
      this.state.escNeutralTime = (this.state.escNeutralTime || 0) + dt;
      if (this.state.escBrakeUsed && this.state.escNeutralTime > 0.05) this.state.escReverseArmed = true;
    }

    if (thr > 0.008) {
      // Velocità target strettamente proporzionale alla pressione del grilletto (20% grilletto = 20% velocità, 50% = 50% velocità)
      const targetSpeed = thr * effectiveTopSpeed;
      const speedDiff = targetSpeed - vForward;
      if (speedDiff > 0) {
        // Coppia proporzionale al grilletto (la progressività la decide solo l'esponenziale gas del menu)
        const torqueEnvelope = thr * clamp(speedDiff / (effectiveTopSpeed * 0.42), 0.18, 1.0);
        driveAccel = torqueEnvelope * effectiveMaxAccel;
      } else {
        // Rilascio parziale del gas: freno motore fluido e naturale fino a raggiungere la velocità impostata dal grilletto
        driveAccel = -Math.min(Math.abs(speedDiff) * 3.8, drag * 1.25);
      }
    } else if (brk > 0.008) {
      if (vForward > 0.06) {
        // Frenata lineare col grilletto (la forma la decide l'esponenziale freno del menu): freno solo dietro,
        // a fondo circa 0,5 g come una RWD sul tappeto RCP
        const maxBrakeDecel = 5.0 * (0.65 + 0.35 * rearGrip) * this.state.tireGripFactor;
        driveAccel = -brk * maxBrakeDecel;
        if (vForward + driveAccel * dt < 0) {
          driveAccel = -vForward / dt;
        }
      } else if (!this.state.escReverseArmed) {
        // Fermo col freno tenuto: l'ESC tiene il freno, niente retro finché non si torna al neutro
        vForward = 0;
        driveAccel = 0;
      } else {
        const revTop = effectiveTopSpeed * 0.32 * brk;
        if (vForward > -revTop) {
          driveAccel = -brk * 3.4;
        } else {
          driveAccel = (-revTop - vForward) * 3.5;
        }
      }
    } else {
      if (Math.abs(vForward) > 0.005) {
        driveAccel = -Math.sign(vForward) * Math.min(Math.abs(vForward) / dt, drag);
      } else {
        vForward = 0;
      }
    }

    vForward += driveAccel * dt;

    // 3. STERZO GEOMETRICO (modello a bicicletta, passo 98 mm):
    // a bassa velocità l'auto gira sul raggio dato dall'angolo delle ruote (R = passo / tan δ, ~20 cm a fine corsa);
    // salendo di velocità le gomme scivolano un po' (gradiente di sottosterzo) e la velocità d'imbardata
    // è limitata dall'aderenza dell'anteriore (sottosterzo progressivo invece di uno sterzo "attenuato" a tavolino)
    const steerAmount = Math.abs(input.steer);
    // Transizione continua tra "sterzo al centro" e "sterzo inserito" (niente soglie che fanno scattare lo smorzamento)
    const centerBlend = 1 - smoothstep(0, 0.08, steerAmount);
    const effectiveFrontGrip = frontGrip * this.state.tireGripFactor;
    const effectiveRearGrip = rearGrip * this.state.tireGripFactor;

    const absV = Math.abs(vForward);
    const directionSign = vForward >= -0.05 ? 1 : -1;
    const charSpeed = UNDERSTEER_CHAR_SPEED * Math.sqrt(Math.max(0.3, effectiveFrontGrip));
    const understeerFactor = 1 + (absV * absV) / (charSpeed * charSpeed);
    // T-plate e differenziale cambiano quanto l'auto ruota al limite, non la geometria a bassa velocità
    const lateralLimit = FRONT_LATERAL_ACCEL * effectiveFrontGrip * tPlate.responsiveness * diff.rotationEase;
    const gripYawLimit = lateralLimit / Math.max(0.25, absV);

    // Angolo di sterzo della "bicicletta" equivalente (media delle due ruote anteriori): a fine corsa ~26°,
    // stima per una Mini-Z vera (25–30°, da confermare con un goniometro). Le ruote visibili usano l'Ackermann.
    // Sterzo progressivo con la velocità (regolabile nel menu, 0 = curva fissa come su una radio): lo stick a fondo
    // porta sempre le ruote all'angolo vero, ma in velocità la curva diventa più dolce al centro, così il tratto
    // utile fino al limite di aderenza occupa circa il 70% della corsa invece dei primi millimetri
    const steerProgressive = clamp(input.steerSpeedLimit ?? 0, 0, 1);
    const gripLimitAngle = Math.atan(
      (this.wheelbase * understeerFactor * lateralLimit) / Math.max(0.01, absV * absV)
    );
    const limitRatio = Math.min(1, gripLimitAngle / MAX_STEER_RAD);
    // Esponenziale stile radio y = (1-a)x + a·x³, con a scelto perché il 70% di corsa dia l'angolo limite
    const speedExpo = clamp((PROGRESSIVE_STICK_POINT - limitRatio) / (PROGRESSIVE_STICK_POINT - PROGRESSIVE_STICK_POINT ** 3), 0, 1) * steerProgressive;
    const stick = clamp(input.steer, -1, 1);
    const shapedSteer = (1 - speedExpo) * stick + speedExpo * stick * stick * stick;
    this.state.steerAngle = -shapedSteer * MAX_STEER_RAD;

    const tanSteer = Math.tan(this.state.steerAngle);
    const kinematicYaw = (absV * tanSteer) / (this.wheelbase * understeerFactor);
    const targetYawRate = gripYawLimit * Math.tanh(kinematicYaw / gripYawLimit) * directionSign;

    const yawDampingRate = 18.0 + 27.0 * centerBlend;
    this.state.angularVel += (targetYawRate - this.state.angularVel) * Math.min(1, dt * yawDampingRate);
    if (steerAmount < 0.001 && Math.abs(this.state.angularVel) < 0.03) {
      this.state.angularVel = 0;
    }
    this.state.heading += this.state.angularVel * dt;

    // Forza centrifuga in curva: se entri troppo forte oltre il limite delle gomme RCP, il muso allarga progressivamente la linea (sottosterzo sincero)
    const centripetalLoad = this.state.angularVel * vForward;
    const maxLateralGripAccel = (isDriftSetup ? 5.2 : 12.5) * effectiveRearGrip * chassis.stabilityFactor;
    if (Math.abs(centripetalLoad) > maxLateralGripAccel) {
      const excessOutward = (Math.abs(centripetalLoad) - maxLateralGripAccel) * Math.sign(centripetalLoad) * 0.36;
      vLateral -= excessOutward * dt;
    }

    // Sovrasterzo controllabile solo con assetto Drift o spalancando il gas a ruote sterzate
    if (steerAmount > 0.02 && (isDriftSetup || (chassis.driveType === 'RWD' && thr > 0.85 && effectiveRearGrip < 1.02))) {
      const powerSlide = thr * Math.sin(this.state.steerAngle) * (isDriftSetup ? 2.6 : 0.75);
      vLateral -= powerSlide * dt;
    }

    // Riallineamento laterale immediato e composto quando raddrizzi lo stick
    const baseLatDamp = isDriftSetup ? 4.5 : 18.5 * effectiveRearGrip * chassis.stabilityFactor;
    const lateralDamping = baseLatDamp * (1 + 1.1 * centerBlend);
    vLateral -= vLateral * Math.min(1, lateralDamping * dt);
    if (steerAmount < 0.001 && Math.abs(vLateral) < 0.015) {
      vLateral = 0;
    }

    // Ricompone il vettore velocità nel mondo 3D
    const newFwdX = Math.sin(this.state.heading);
    const newFwdZ = Math.cos(this.state.heading);
    const newRightX = newFwdZ;
    const newRightZ = -newFwdX;

    this.state.vx = newFwdX * vForward + newRightX * vLateral;
    this.state.vz = newFwdZ * vForward + newRightZ * vLateral;
    this.state.speed = vForward;
    this.state.lateralSpeed = vLateral;
    this.state.slipAmount = Math.min(1.5, Math.abs(vLateral) / Math.max(0.4, Math.abs(vForward)));

    // Avanza posizione (nessun segno nero lasciato sulla pista!)
    this.state.x += this.state.vx * dt;
    this.state.z += this.state.vz * dt;

    // Rollio e Beccheggio realistici delle sospensioni Mini-Z (molla anteriore + T-Plate posteriore)
    const targetRoll =
      clamp(
        (-this.state.angularVel * vForward * 0.018) / frontSpring.rollStiffness,
        -0.13,
        0.13
      );
    const targetPitch = clamp(-driveAccel * 0.0022 * tPlate.rearFlex, -0.06, 0.06);

    this.state.roll += (targetRoll - this.state.roll) * Math.min(1, dt * 16);
    this.state.pitch += (targetPitch - this.state.pitch) * Math.min(1, dt * 16);

    // Rotazione ruote (raggio ruota = 1.25 cm)
    this.state.wheelSpin += (vForward * dt) / REAL_SCALE.WHEEL_RADIUS;

    // Controllo collisioni con i cordoli e le sponde morbide RCP Track
    if (trackData && trackData.checkCollision) {
      const col = trackData.checkCollision(this.state.x, this.state.z, REAL_SCALE.CAR_WIDTH * 0.52);

      // Se sale violentemente su un cordolo con gomme anteriori super morbide (20°) e molla morbida -> rischio Grip-Roll!
      if (col.onCurb && Math.abs(vForward) > 4.2 && Math.abs(this.state.steerAngle) > 0.34) {
        const rollRisk = frontTire.gripRollRisk * frontSpring.gripRollMod;
        if (rollRisk > 1.48 && Math.random() < dt * 0.85) {
          this.state.isFlipped = true;
          this.state.flipTimer = 1.45;
          if (onGripRollFlip) onGripRollFlip(this.state.x, this.state.z);
        }
      }

      if (col.hitWall) {
        this.state.x = col.correctedX;
        this.state.z = col.correctedZ;
        // Urto sulla sponda RCP: componente normale e tangenziale separate.
        // La sponda in gomma assorbe quasi tutto il colpo (restituzione bassa),
        // mentre lungo la barriera la carrozzeria in policarbonato striscia con
        // poco attrito (Coulomb): l'auto scivola lungo la sponda invece di incollarsi.
        const nX = col.normalX;
        const nZ = col.normalZ;
        const dot = this.state.vx * nX + this.state.vz * nZ;
        if (dot < 0) {
          const impact = -dot;
          // Più forte l'urto, più la gomma espansa si schiaccia e meno restituisce
          const restitution = clamp(0.32 - impact * 0.04, 0.14, 0.32);
          const tX = this.state.vx - dot * nX;
          const tZ = this.state.vz - dot * nZ;
          const vt = Math.hypot(tX, tZ);
          // Attrito carrozzeria/sponda: impulso tangenziale ≤ μ · impulso normale
          const slideFriction = 0.22;
          const tangentLoss = Math.min(vt, slideFriction * (1 + restitution) * impact);
          const tScale = vt > 1e-6 ? (vt - tangentLoss) / vt : 0;
          this.state.vx = tX * tScale + restitution * impact * nX;
          this.state.vz = tZ * tScale + restitution * impact * nZ;

          // Toccando di striscio il muso viene raddrizzato lungo la sponda
          if (vt > 0.2) {
            const fX = Math.sin(this.state.heading);
            const fZ = Math.cos(this.state.heading);
            const along = fX * tX + fZ * tZ >= 0 ? 1 : -1;
            const targetHeading = Math.atan2(along * tX, along * tZ);
            let diff = targetHeading - this.state.heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            if (Math.abs(diff) < 1.05) {
              this.state.heading += diff * Math.min(0.45, impact * 0.18);
            }
          }

          const fwdNowX = Math.sin(this.state.heading);
          const fwdNowZ = Math.cos(this.state.heading);
          this.state.speed = this.state.vx * fwdNowX + this.state.vz * fwdNowZ;
          if (onWallHit) onWallHit(impact);
        }
      }
    }

    this.syncVisuals(dt);
  }

  syncVisuals() {
    if (this.onWorkbench) {
      this.rootGroup.position.set(this.workbenchPose.x, this.workbenchPose.y, this.workbenchPose.z);
      this.rootGroup.rotation.y = this.workbenchPose.heading;
      this.sprungGroup.rotation.set(0, 0, 0);
      this.sprungGroup.position.y = 0;
    } else {
      this.rootGroup.position.set(this.state.x, this.state.y, this.state.z);
      this.rootGroup.rotation.y = this.state.heading;
      this.sprungGroup.rotation.z = this.state.roll;
      this.sprungGroup.rotation.x = this.state.pitch;
      this.sprungGroup.position.y = this.state.isFlipped ? 0.032 : 0;
    }

    if (this.rearBrakeGlow) {
      this.rearBrakeGlow.visible = Boolean(this.state.braking && !this.onWorkbench);
    }

    // Ackermann semplificato: la ruota interna alla curva sterza più di quella esterna, così le due ruote
    // puntano allo stesso centro di curva (lf sta sul lato +X, rf sul lato -X)
    const steerShown = this.onWorkbench ? 0 : this.state.steerAngle;
    const { left: steerLeft, right: steerRight } = ackermannAngles(steerShown, this.wheelbase);

    // Ruote del telaio MR-04 (il fusello sterza, il gruppo interno "spin" rotola)
    if (this.chassisWheelMeshes.lf) {
      this.chassisWheelMeshes.lf.rotation.y = steerLeft;
      this.chassisWheelMeshes.rf.rotation.y = steerRight;
      for (const key of ['lf', 'rf', 'lr', 'rr']) {
        const spin = this.chassisWheelMeshes[key].userData.spin;
        if (spin) spin.rotation.x = this.state.wheelSpin;
      }
    }

    // Ruote del modello 3D GLB (es. Ferrari 499P) imperniate sul proprio mozzo
    for (const w of this.glbWheelNodes.lf) {
      w.steerPivot.rotation.y = steerLeft;
      w.spinPivot.rotation.x = this.state.wheelSpin;
    }
    for (const w of this.glbWheelNodes.rf) {
      w.steerPivot.rotation.y = steerRight;
      w.spinPivot.rotation.x = this.state.wheelSpin;
    }
    for (const w of this.glbWheelNodes.lr) {
      w.spinPivot.rotation.x = this.state.wheelSpin;
    }
    for (const w of this.glbWheelNodes.rr) {
      w.spinPivot.rotation.x = this.state.wheelSpin;
    }

    // Luci stop rosse
    const brakeColor = this.state.braking ? 0xff1122 : 0x550000;
    for (const mat of this.brakeLightMaterials) {
      mat.color.setHex(brakeColor);
    }
  }

  applyReplayFrame(frame) {
    this.rootGroup.position.set(frame.x, frame.y, frame.z);
    this.rootGroup.rotation.y = frame.heading;
    this.sprungGroup.rotation.z = frame.roll;
    this.sprungGroup.rotation.x = frame.pitch;
    const brakeColor = frame.braking ? 0xff1122 : 0x550000;
    for (const mat of this.brakeLightMaterials) {
      mat.color.setHex(brakeColor);
    }
  }
}

// Angolo massimo delle ruote anteriori (media delle due ruote) a fine corsa con dual rate 100%
const MAX_STEER_RAD = (26 * Math.PI) / 180;
// Velocità caratteristica del sottosterzo con gomme di riferimento (m/s): sotto questa l'auto segue la geometria,
// sopra le gomme scivolano e il raggio di curva si allarga
const UNDERSTEER_CHAR_SPEED = 2.8;
// Accelerazione laterale massima dell'anteriore con gomme di riferimento sul tappeto RCP (m/s², circa 0,9 g: con le gomme di serie si arriva a circa 1,2 g)
const FRONT_LATERAL_ACCEL = 9.0;
// Sterzo progressivo: frazione di corsa dello stick che, in velocità, porta l'anteriore al limite di aderenza
const PROGRESSIVE_STICK_POINT = 0.7;
// Carreggiata anteriore (distanza tra i centri delle ruote)
const FRONT_TRACK = 0.066;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Angoli delle due ruote anteriori con Ackermann dal raggio di curva della ruota "media"
function ackermannAngles(steerAngle, wheelbase) {
  if (Math.abs(steerAngle) < 1e-4) return { left: steerAngle, right: steerAngle };
  const radius = wheelbase / Math.tan(Math.abs(steerAngle));
  const inner = Math.atan(wheelbase / (radius - FRONT_TRACK / 2));
  const outer = Math.atan(wheelbase / (radius + FRONT_TRACK / 2));
  const sign = Math.sign(steerAngle);
  // steerAngle > 0 gira verso +X: la ruota interna è la sinistra (lf, lato +X)
  return sign > 0
    ? { left: inner * sign, right: outer * sign }
    : { left: outer * sign, right: inner * sign };
}

