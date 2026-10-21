import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
      flipTimer: 0
    };

    this.currentSetup = null;
    this.buildDetailedChassis3D();
    this.buildLights3D();
  }

  // Costruisce il vero telaio Kyosho Mini-Z (14.5 cm telaio interno dentro i 17.2 cm di carrozzeria)
  buildDetailedChassis3D() {
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x151922,
      roughness: 0.35,
      metalness: 0.45
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.85
    });
    const pcbMat = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      roughness: 0.5
    });
    const batteryBlueMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.3,
      metalness: 0.5
    });

    // Piastra inferiore telaio principale (Main Chassis)
    const mainPlate = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.004, 0.128), carbonMat);
    mainPlate.position.set(0, 0.009, 0);
    mainPlate.castShadow = true;
    this.chassisGroup.add(mainPlate);

    // Paraurti anteriore in spugna/plastica (Front Bumper Mini-Z)
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.005, 0.018), carbonMat);
    bumper.position.set(0, 0.009, 0.072);
    this.chassisGroup.add(bumper);

    // 4 Batterie Ministilo AAA in scala reale (44.5mm x 10.5mm ciascuna!)
    const aaaGeo = new THREE.CylinderGeometry(0.0052, 0.0052, 0.044, 12);
    const batteryOffsets = [
      { x: -0.021, z:  0.008 },
      { x: -0.021, z: -0.016 },
      { x:  0.021, z:  0.008 },
      { x:  0.021, z: -0.016 }
    ];
    for (const pos of batteryOffsets) {
      const cell = new THREE.Mesh(aaaGeo, batteryBlueMat);
      cell.rotation.x = Math.PI / 2;
      cell.position.set(pos.x, 0.015, pos.z);
      this.chassisGroup.add(cell);
    }

    // Scheda Elettronica centrale ICS / ESC + Dissipatore Dorato
    const escBox = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.036), pcbMat);
    escBox.position.set(0, 0.017, 0.012);
    this.chassisGroup.add(escBox);

    const heatsink = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.005, 0.022), goldMat);
    heatsink.position.set(0, 0.025, 0.012);
    this.chassisGroup.add(heatsink);

    // Sospensione anteriore + 2 Molle Anteriori (Kingpin Coil Springs) che cambiano colore!
    const springGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.013, 12);
    const springMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.3,
      metalness: 0.6
    });
    const leftSpring = new THREE.Mesh(springGeo, springMat);
    leftSpring.position.set(0.024, 0.018, 0.049);
    const rightSpring = new THREE.Mesh(springGeo, springMat);
    rightSpring.position.set(-0.024, 0.018, 0.049);
    this.springMeshes = [leftSpring, rightSpring];
    this.chassisGroup.add(leftSpring, rightSpring);

    // T-Plate in carbonio posteriore + Ammortizzatore centrale superiore (Center Shock)
    const tPlate = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.002, 0.038), carbonMat);
    tPlate.position.set(0, 0.008, -0.036);
    this.chassisGroup.add(tPlate);

    const centerShock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.034, 10),
      goldMat
    );
    centerShock.rotation.x = Math.PI / 2;
    centerShock.position.set(0, 0.027, -0.026);
    this.chassisGroup.add(centerShock);

    // Banchino Motore Posteriore (Motor Pod) + Cassa Motore Brushless colorata
    const motorPod = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.018, 0.032), carbonMat);
    motorPod.position.set(0, 0.015, -0.046);
    this.chassisGroup.add(motorPod);

    const motorCanMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.25,
      metalness: 0.85
    });
    this.motorCanMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0075, 0.0075, 0.024, 16),
      motorCanMat
    );
    this.motorCanMesh.rotation.z = Math.PI / 2;
    this.motorCanMesh.position.set(0.002, 0.017, -0.044);
    this.chassisGroup.add(this.motorCanMesh);

    // 4 Ruote del telaio (visibili quando si toglie la carrozzeria o con carrozzerie senza ruote)
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.75 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.75 });

    const createWheel = (isRear) => {
      const wGroup = new THREE.Group();
      const width = isRear ? 0.014 : 0.011; // 14mm dietro (Wide), 11mm davanti (Narrow)
      const radius = REAL_SCALE.WHEEL_RADIUS; // 12.5mm raggio = 25mm diametro reale
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), tireMat);
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, width + 0.001, 16), rimMat);
      rim.rotation.z = Math.PI / 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.0015, radius * 1.3, 0.003), goldMat);
      wGroup.add(tire, rim, spoke);
      return wGroup;
    };

    const halfTrack = 0.033;
    const halfWb = REAL_SCALE.WHEELBASE / 2; // 0.049m (98mm wheelbase / 2)

    this.chassisWheelMeshes.lf = createWheel(false);
    this.chassisWheelMeshes.lf.position.set(halfTrack, REAL_SCALE.WHEEL_RADIUS, halfWb);

    this.chassisWheelMeshes.rf = createWheel(false);
    this.chassisWheelMeshes.rf.position.set(-halfTrack, REAL_SCALE.WHEEL_RADIUS, halfWb);

    this.chassisWheelMeshes.lr = createWheel(true);
    this.chassisWheelMeshes.lr.position.set(halfTrack, REAL_SCALE.WHEEL_RADIUS, -halfWb);

    this.chassisWheelMeshes.rr = createWheel(true);
    this.chassisWheelMeshes.rr.position.set(-halfTrack, REAL_SCALE.WHEEL_RADIUS, -halfWb);

    this.chassisGroup.add(
      this.chassisWheelMeshes.lf,
      this.chassisWheelMeshes.rf,
      this.chassisWheelMeshes.lr,
      this.chassisWheelMeshes.rr
    );
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
    const springSpec = FRONT_SPRINGS.find((s) => s.id === setup.frontSpringId) || FRONT_SPRINGS[1];
    for (const sm of this.springMeshes) {
      sm.material.color.set(springSpec.colorHex);
    }

    const motorSpec = MOTORS.find((m) => m.id === setup.motorId) || MOTORS[2];
    if (this.motorCanMesh) {
      this.motorCanMesh.material.color.set(motorSpec.colorHex);
    }

    // 2. Carica o aggiorna la Carrozzeria 3D selezionata
    await this.loadCarBody(setup.bodyId, setup.customBodyColor, setup.showNakedChassis);
  }

  async loadCarBody(bodyId, customColorHex, showNakedChassis) {
    // Pulisce il bodyGroup attuale
    while (this.bodyGroup.children.length > 0) {
      this.bodyGroup.remove(this.bodyGroup.children[0]);
    }
    this.glbWheelNodes = { lf: [], rf: [], lr: [], rr: [], steerLf: [], steerRf: [] };

    const bodySpec = CAR_BODIES.find((b) => b.id === bodyId) || CAR_BODIES[0];

    if (bodySpec.glbUrl) {
      try {
        const gltfScene = await this.fetchGlbModel(bodySpec.glbUrl);
        const clone = gltfScene.clone(true);

        // Nasconde i nodi sfocati (RIM_BLUR), i billboard opachi (glowx) e i LOD a bassa risoluzione presenti nel file .glb
        clone.traverse((node) => {
          const name = node.name || '';
          const matName = node.material?.name || '';
          if (
            /RIM_BLUR|Rim_Blurred|COCKPIT_LR|STEER_LR|DAMAGE|glow/i.test(name) ||
            /Rim_Blur|GLOW/i.test(matName)
          ) {
            node.visible = false;
          }
          if (node.isMesh && node.visible) {
            node.castShadow = true;
            node.receiveShadow = true;

            // Clona e calibra i materiali PBR del modello 3D Ferrari 499P
            node.material = Array.isArray(node.material)
              ? node.material.map((m) => (m ? m.clone() : m))
              : node.material
                ? node.material.clone()
                : node.material;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            const useCustomColor =
              customColorHex &&
              bodySpec.defaultColor &&
              customColorHex.toLowerCase() !== bodySpec.defaultColor.toLowerCase();
            const tintHex = useCustomColor ? customColorHex : bodySpec.liveryTint || '#ffffff';

            mats.forEach((mat) => {
              if (!mat) return;
              const mName = mat.name || '';
              if (mat.map) mat.map.anisotropy = 8;

              if (/^Body$/i.test(mName) || /^main$/i.test(mName)) {
                mat.color?.set(tintHex);
                mat.metalness = 0.14;
                mat.roughness = 0.16;
                if ('clearcoat' in mat) {
                  mat.clearcoat = 1.0;
                  mat.clearcoatRoughness = 0.04;
                }
                if (tintHex.toLowerCase() !== '#ffffff') {
                  mat.emissive?.set(tintHex);
                  mat.emissiveMap = null;
                  mat.emissiveIntensity = 0.36;
                } else if (/^Body$/i.test(mName) && mat.emissiveMap) {
                  mat.emissiveIntensity = 0.0;
                }
                mat.envMapIntensity = 1.35;
                mat.needsUpdate = true;
              } else if (/Glass/i.test(mName)) {
                mat.metalness = 0.08;
                mat.roughness = 0.06;
                mat.transparent = true;
                mat.opacity = 0.62;
                mat.needsUpdate = true;
              } else if (/Tyre/i.test(mName)) {
                mat.metalness = 0.04;
                mat.roughness = 0.78;
                mat.needsUpdate = true;
              } else if (/RIMS|Wheels/i.test(mName)) {
                mat.color?.setRGB(0.92, 0.92, 0.95);
                mat.metalness = 0.75;
                mat.roughness = 0.24;
                mat.needsUpdate = true;
              }
            });
          }
        });

        // Calcola il Bounding Box reale solo sui mesh VISIBILI del modello .glb per ridimensionarlo esattamente a 17.2 cm
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
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        // Determina la dimensione longitudinale massima e scala a REAL_SCALE.CAR_LENGTH (0.172m = 17.2cm)
        const targetLength = (bodySpec.lengthCm || 17.2) / 100;
        const maxHorizontal = Math.max(size.z, size.x, 0.001);
        const scaleFactor = targetLength / maxHorizontal;

        const wrapper = new THREE.Group();
        clone.scale.setScalar(scaleFactor);

        // Se il modello era orientato lungo X invece che lungo Z, lo ruota automaticamente
        if (size.x > size.z * 1.15) {
          clone.rotation.y = Math.PI / 2;
        }

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
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);

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
          if (!rawWheels.lf && /^WHEEL_LF(_\d+)?$/i.test(n)) rawWheels.lf = node;
          else if (!rawWheels.rf && /^WHEEL_RF(_\d+)?$/i.test(n)) rawWheels.rf = node;
          else if (!rawWheels.lr && /^WHEEL_LR(_\d+)?$/i.test(n)) rawWheels.lr = node;
          else if (!rawWheels.rr && /^WHEEL_RR(_\d+)?$/i.test(n)) rawWheels.rr = node;
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
      // Mostra solo il telaio Kyosho Mini-Z completo con batterie ministilo, molle e motore
      this.bodyGroup.visible = false;
      this.chassisGroup.visible = true;
      this.proceduralLightsGroup.visible = false;
      this.setChassisWheelsVisible(true);
    } else {
      // Con la carrozzeria montata, nasconde il telaio interno così le batterie AAA non sporgono mai dal cofano/tetto!
      this.bodyGroup.visible = true;
      this.chassisGroup.visible = !hasGlbWheels;
      this.proceduralLightsGroup.visible = !hasGlbWheels;
      this.setChassisWheelsVisible(!hasGlbWheels);
    }
  }

  resetOnTrack(x, z, heading) {
    this.state.x = x;
    this.state.y = 0.008;
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

    // Angolo massimo delle ruote anteriori (~26 gradi reali, modulato dal Dual Rate del radiocomando)
    const maxSteerRad = 0.46;
    this.state.steerAngle = -input.steer * maxSteerRad;

    // Direzione longitudinale e laterale dell'auto
    const fwdX = Math.sin(this.state.heading);
    const fwdZ = Math.cos(this.state.heading);
    const rightX = fwdZ;
    const rightZ = -fwdX;

    // Scomposizione velocità nel sistema di riferimento della Mini-Z
    let vForward = this.state.vx * fwdX + this.state.vz * fwdZ;
    let vLateral = this.state.vx * rightX + this.state.vz * rightZ;

    // Velocità massima e accelerazione dal motore + pignone
    const topSpeed = motor.maxSpeedMs * pinion.speedMult * (bodySpec.aeroBonus ? 1 + (bodySpec.aeroBonus - 1) * 0.25 : 1);
    const maxAccel = motor.accelMs2 * pinion.accelMult;

    // Gestione Gas, Freno e Retromarcia
    this.state.braking = input.brake > 0.08 && vForward > 0.15;

    let driveAccel = 0;
    if (input.throttle > 0.01) {
      const speedRatio = Math.max(0, vForward / topSpeed);
      const torqueCurve = Math.max(0.12, 1 - Math.pow(speedRatio, 1.45));
      driveAccel += input.throttle * maxAccel * torqueCurve;
    }

    if (input.brake > 0.01) {
      if (vForward > 0.08) {
        // Frenata proporzionale all'EPA del radiocomando
        driveAccel -= input.brake * 21.0;
      } else {
        // Retromarcia dolce
        const revTop = topSpeed * 0.38;
        if (vForward > -revTop) {
          driveAccel -= input.brake * 7.5;
        }
      }
    }

    // Freno motore naturale quando rilasci il grilletto del gas
    const drag = (2.1 * motor.motorBrake + Math.abs(vForward) * 0.45) * rearTire.dragFactor;
    if (Math.abs(input.throttle) < 0.03 && Math.abs(input.brake) < 0.03) {
      vForward -= Math.sign(vForward) * Math.min(Math.abs(vForward), drag * dt);
    }

    vForward += driveAccel * dt;

    // Calcolo tenuta laterale (Gomme Anteriori + Posteriori + Telaio RWD/AWD + Molle + T-Plate)
    const isDriftSetup = frontTire.id === 'front_drift_lf' || rearTire.id === 'rear_drift_lf';
    const frontGrip = frontTire.gripFront * chassis.turnInFactor * frontSpring.turnInBoost * trackGrip;
    const rearGrip = rearTire.gripRear * tPlate.exitTraction * diff.tractionStab * trackGrip;

    // Rotazione in curva (Yaw rate)
    const speedFactor = Math.min(1.0, Math.abs(vForward) / 0.65);
    const turnResponsiveness = 11.2 * frontGrip * tPlate.responsiveness * diff.rotationEase;
    const directionSign = vForward >= -0.05 ? 1 : -1;
    const targetYawRate = this.state.steerAngle * turnResponsiveness * speedFactor * directionSign;

    this.state.angularVel += (targetYawRate - this.state.angularVel) * Math.min(1, dt * 18);
    this.state.heading += this.state.angularVel * dt;

    // Sovrasterzo di potenza / Drift quando si accelera forte in curva
    const corneringLoad = Math.abs(this.state.angularVel * vForward);
    if (isDriftSetup || (chassis.driveType === 'RWD' && input.throttle > 0.75 && rearGrip < 1.05)) {
      const powerSlide = input.throttle * Math.sin(this.state.steerAngle) * (isDriftSetup ? 3.4 : 1.15);
      vLateral -= powerSlide * dt;
    }

    // Smorzamento scivolamento laterale in base al grip delle gomme posteriori
    const lateralDamping = isDriftSetup ? 3.2 : 13.5 * rearGrip * chassis.stabilityFactor;
    vLateral -= vLateral * Math.min(1, lateralDamping * dt);

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

    // Avanza posizione
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
        // Rimbalzo morbido e smorzato sulle sponde in gomma espansa RCP
        const dot = this.state.vx * col.normalX + this.state.vz * col.normalZ;
        if (dot < 0) {
          this.state.vx = (this.state.vx - 1.35 * dot * col.normalX) * 0.62;
          this.state.vz = (this.state.vz - 1.35 * dot * col.normalZ) * 0.62;
          this.state.speed *= 0.62;
          if (onWallHit) onWallHit(Math.abs(dot));
        }
      }
    }

    this.syncVisuals(dt);
  }

  syncVisuals() {
    this.rootGroup.position.set(this.state.x, this.state.y, this.state.z);
    this.rootGroup.rotation.y = this.state.heading;

    this.sprungGroup.rotation.z = this.state.roll;
    this.sprungGroup.rotation.x = this.state.pitch;
    this.sprungGroup.position.y = this.state.isFlipped ? 0.032 : 0;

    // Ruote del telaio
    if (this.chassisWheelMeshes.lf) {
      this.chassisWheelMeshes.lf.rotation.y = this.state.steerAngle;
      this.chassisWheelMeshes.rf.rotation.y = this.state.steerAngle;
      this.chassisWheelMeshes.lf.children[0].rotation.x = this.state.wheelSpin;
      this.chassisWheelMeshes.rf.children[0].rotation.x = this.state.wheelSpin;
      this.chassisWheelMeshes.lr.children[0].rotation.x = this.state.wheelSpin;
      this.chassisWheelMeshes.rr.children[0].rotation.x = this.state.wheelSpin;
    }

    // Ruote del modello 3D GLB (es. Ferrari 499P) imperniate sul proprio mozzo
    for (const w of this.glbWheelNodes.lf) {
      w.steerPivot.rotation.y = this.state.steerAngle;
      w.spinPivot.rotation.x = this.state.wheelSpin;
    }
    for (const w of this.glbWheelNodes.rf) {
      w.steerPivot.rotation.y = this.state.steerAngle;
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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
