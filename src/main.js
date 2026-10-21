import * as THREE from 'three';
import {
  CAR_BODIES,
  CHASSIS_LIST,
  FRONT_TIRES,
  REAR_TIRES,
  MOTORS,
  PINIONS,
  FRONT_SPRINGS,
  T_PLATES,
  DIFFERENTIALS
} from './data/parts.js';
import { TRACK_LAYOUTS } from './data/tracks.js';
import { ProfileManager } from './storage/ProfileManager.js';
import { ControllerManager } from './input/ControllerManager.js';
import { SoundAndCommentary } from './audio/SoundAndCommentary.js';
import { ReplaySystem, REPLAY_CAMERAS } from './replay/ReplaySystem.js';
import { ClubEnvironment } from './world/ClubEnvironment.js';
import { MiniZCar } from './car/MiniZCar.js';
import { ROST } from './club/config.js';
import { keepDriverCarVisible } from './club/driver-framing.js';
import { createQualityComposer } from './club/graphics-quality.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class MiniZSimulatorApp {
  constructor() {
    this.profileManager = new ProfileManager();
    this.controller = new ControllerManager(this.profileManager);
    this.replay = new ReplaySystem();

    this.sound = new SoundAndCommentary(this.profileManager, (text, active) => {
      const banner = document.getElementById('commentary-banner');
      const txtEl = document.getElementById('commentary-text');
      if (txtEl && text) txtEl.textContent = text;
      if (banner) banner.classList.toggle('speaking', Boolean(active));
    });

    // Mappe nomi per etichette profili
    this.bodyNamesMap = Object.fromEntries(CAR_BODIES.map((b) => [b.id, b.name]));
    this.trackNamesMap = Object.fromEntries(TRACK_LAYOUTS.map((t) => [t.id, t.name]));

    // Stato Cronometro Gara
    this.lapNumber = 0;
    this.lapStartTime = 0;
    this.currentLapSec = 0;
    this.lastLapSec = null;
    this.bestLapSec = null;
    this.timerRunning = false;

    // Telecamera di guida ('stand_normal' | 'stand_zoom' | 'pit_bench' | 'chase_drive')
    this.driveCameraMode = 'stand_normal';
    this.cameraLookTarget = new THREE.Vector3(0, 0.03, 1.42);

    // Contatore FPS in tempo reale
    this.fpsFrames = 0;
    this.fpsLastTime = performance.now();
    this.currentFps = 60;

    // Evento installazione PWA
    this.deferredInstallPrompt = null;

    this.initPWA();
    this.initThreeScene();
    this.bootSimulator();
  }

  initPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
    });
  }

  initThreeScene() {
    this.canvas = document.getElementById('sim-canvas');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14171f);
    this.scene.fog = new THREE.Fog(0x14171f, 18, 34);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.03, 50);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Controlli Orbit per la visuale libera in Sala ("Ruota in Sala")
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(2.45, -0.05, -1.8);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.07;
    this.orbit.maxDistance = 12;
    this.orbit.minDistance = 0.25;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.orbit.enabled = false;

    // Illuminazione realistica della sala del club (identica a Slot-Car)
    const hemi = new THREE.HemisphereLight(0xfff6e8, 0x3a3228, 0.72);
    hemi.position.set(2.5, 3.3, -1.8);
    this.scene.add(hemi);

    this.mainCeilingLight = new THREE.DirectionalLight(0xfff5e4, 2.35);
    this.mainCeilingLight.position.set(3.4, 3.2, 0.8);
    this.mainCeilingLight.target.position.set(2.4, 0, -1.9);
    this.mainCeilingLight.castShadow = true;
    this.mainCeilingLight.shadow.mapSize.set(2048, 2048);
    this.mainCeilingLight.shadow.camera.left = -8.6;
    this.mainCeilingLight.shadow.camera.right = 8.6;
    this.mainCeilingLight.shadow.camera.top = 7.0;
    this.mainCeilingLight.shadow.camera.bottom = -7.0;
    this.mainCeilingLight.shadow.camera.near = 0.5;
    this.mainCeilingLight.shadow.camera.far = 7.5;
    this.mainCeilingLight.shadow.bias = -0.0003;
    this.mainCeilingLight.shadow.normalBias = 0.012;
    this.scene.add(this.mainCeilingLight);
    this.scene.add(this.mainCeilingLight.target);

    const fill1 = new THREE.PointLight(0xffe9c8, 3.5, 13, 1.4);
    fill1.position.set(-1.5, 2.8, -2.0);
    this.scene.add(fill1);

    const fill2 = new THREE.PointLight(0xe6f0ff, 3.5, 13, 1.4);
    fill2.position.set(6.2, 2.8, -2.0);
    this.scene.add(fill2);

    // Post-processing di qualità (GTAO Ambient Occlusion + Bloom + OutputPass come in Slot-Car)
    this.qualityComposer = createQualityComposer(this.renderer, this.scene, this.camera, this.mainCeilingLight);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.qualityComposer.resize();
    });
  }

  async bootSimulator() {
    const statusText = document.getElementById('loading-status-text');
    const pctText = document.getElementById('loading-percent');
    const barFill = document.getElementById('loading-bar-fill');

    const setProgress = (pct, msg) => {
      if (pctText) pctText.textContent = `${pct}%`;
      if (barFill) barFill.style.width = `${pct}%`;
      if (msg && statusText) statusText.textContent = msg;
    };

    setProgress(15, 'Allestimento sala del Club Mini-Z, pedana piloti, officina 3 banchi e direzione gara...');
    this.club = new ClubEnvironment(this.scene, this.renderer);

    setProgress(35, 'Montaggio tappeto in gomma Kyosho RCP Track (mattonelle 50×50cm)...');
    this.loadActiveTrack(false);

    setProgress(45, 'Caricamento modello 3D Ferrari 499P Hypercar e telaio Kyosho Mini-Z (17,2 cm)...');
    this.car = new MiniZCar(this.scene, (glbPct) => {
      const totalPct = Math.min(98, 45 + Math.round(glbPct * 0.52));
      setProgress(totalPct, `Calibrazione carrozzeria 3D in scala 1:27 (${glbPct}%)...`);
    });

    const activeProfile = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
    await this.car.applySetup(activeProfile.carSetup);
    this.car.resetOnTrack(this.trackData.startX, this.trackData.startZ, this.trackData.startHeading);

    // Applica la modalità di risoluzione grafica salvata
    this.applyGraphicsQuality(this.profileManager.state.graphicsQuality, false);

    // Inizializza l'interfaccia utente e il menu a 5 schede
    this.initUI();

    setProgress(100, 'Pista RCP pronta! Pilota sul palco!');
    setTimeout(() => {
      const loader = document.getElementById('loading-screen');
      if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.classList.add('hidden'), 450);
      }
      this.sound.speak(
        'Benvenuti nella Mini-Z Club Arena! Pilota sul palco di guida con la Ferrari 499P, pista RCP libera!',
        'force'
      );
    }, 350);

    // Avvia il ciclo principale a 60+ FPS
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // Applica una delle 3 modalità di risoluzione grafica ed evidenzia il riquadrino attivo
  applyGraphicsQuality(quality, saveState = true) {
    const q = ['low', 'medium', 'high'].includes(quality) ? quality : 'high';
    this.profileManager.state.graphicsQuality = q;
    if (saveState) this.profileManager.save();

    if (this.qualityComposer) {
      this.qualityComposer.setQuality(q === 'high' ? 'high' : q === 'medium' ? 'medium' : 'low');
    }

    // Aggiorna tutti i riquadrini di selezione risoluzione grafica (sia in alto che nel menu)
    document.querySelectorAll('.res-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.quality === q);
    });
  }

  loadActiveTrack(resetCar = true) {
    const trackId = this.profileManager.state.currentTrackId;
    const rev = this.profileManager.state.reverseTrack;
    this.trackData = this.club.buildTrack(trackId, rev);

    const rec = this.profileManager.state.lapRecords[trackId];
    this.bestLapSec = rec ? rec.timeSec : null;
    this.lapNumber = 0;
    this.lastLapSec = null;
    this.currentLapSec = 0;
    this.timerRunning = false;
    this.club.updateBridgeDisplay(0, null, this.bestLapSec);
    this.updateTimingHUD();

    if (resetCar && this.car) {
      this.car.resetOnTrack(this.trackData.startX, this.trackData.startZ, this.trackData.startHeading);
      this.replay.clear();
    }
  }

  initUI() {
    // Versione app
    const verEl = document.getElementById('hud-version-val');
    if (verEl) verEl.textContent = `v${this.profileManager.state.appVersion}`;

    // Pulsanti 3 modalità di risoluzione grafica
    document.querySelectorAll('.res-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.applyGraphicsQuality(btn.dataset.quality, true);
      });
    });

    // Pulsante Installa App (barra superiore e scheda sistema)
    const handleInstallClick = async () => {
      if (this.deferredInstallPrompt) {
        this.deferredInstallPrompt.prompt();
        await this.deferredInstallPrompt.userChoice;
        this.deferredInstallPrompt = null;
      } else {
        alert(
          '📲 Per installare subito Mini-Z Club Simulator sul tuo computer:\n\n' +
          '• Su Chrome o Edge clicca sull\'icona "Installa Mini-Z Club Simulator" (schermo con freccia) a destra nella barra degli indirizzi in alto!\n' +
          '• Se l\'hai già installata, la trovi direttamente sul tuo Desktop o nel menu Start.'
        );
      }
    };
    document.getElementById('btn-install-app')?.addEventListener('click', handleInstallClick);
    document.getElementById('btn-install-app-menu')?.addEventListener('click', handleInstallClick);

    // Apertura/chiusura Menu Unico
    const menuModal = document.getElementById('main-menu-modal');
    const openMenu = (tabId = null) => {
      this.refreshMenuUI();
      menuModal.classList.remove('hidden');
      if (tabId) this.switchMenuTab(tabId);
    };
    const closeMenu = () => {
      this.controller.cancelListening();
      menuModal.classList.add('hidden');
    };

    document.getElementById('btn-open-menu')?.addEventListener('click', () => openMenu());
    document.getElementById('btn-close-menu')?.addEventListener('click', closeMenu);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (!menuModal.classList.contains('hidden')) closeMenu();
        else if (this.replay.isActive) this.stopReplayMode();
        else openMenu();
      }
    });

    // Navigazione tra le 5 schede del menu
    document.querySelectorAll('.menu-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.switchMenuTab(btn.dataset.tab));
    });

    // Pulsanti Visuale dal Palco (a sinistra)
    document.querySelectorAll('.cam-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        this.setDriveCameraMode(pill.dataset.cam);
      });
    });

    // Pulsante Chiama Commissario (R) e Togli Carrozzeria rapido
    this.controller.onMarshalPressed = () => this.triggerMarshalReset();
    this.controller.onCameraPressed = () => this.cycleDriveCameraMode();
    this.controller.onReplayPressed = () => this.toggleReplayMode();

    document.getElementById('btn-marshal-reset')?.addEventListener('click', () => this.triggerMarshalReset());
    document.getElementById('btn-toggle-shell-quick')?.addEventListener('click', () => this.toggleNakedChassis());
    document.getElementById('btn-Toggle-naked-chassis')?.addEventListener('click', () => this.toggleNakedChassis());

    // Scheda 1: Piste RCP e inversione direzione
    document.getElementById('chk-reverse-track')?.addEventListener('change', (e) => {
      this.profileManager.state.reverseTrack = e.target.checked;
      this.profileManager.save();
      this.loadActiveTrack(true);
      this.sound.speak('Senso di marcia della pista invertito!', 'high');
    });

    document.getElementById('btn-reset-lap-session')?.addEventListener('click', () => {
      this.loadActiveTrack(true);
      closeMenu();
    });

    // Scheda 2: Popola selettori Banco Box (Auto, Telaio, Gomme, Motore, Pignone, Molle, T-Plate, Diff)
    this.initWorkbenchSelectors();

    // Caricamento di un ulteriore file .glb dal PC dell'utente
    document.getElementById('input-custom-glb')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const newId = await this.car.loadCustomGlbFile(file);
      this.bodyNamesMap = Object.fromEntries(CAR_BODIES.map((b) => [b.id, b.name]));
      this.profileManager.state.currentBodyId = newId;
      const prof = this.profileManager.updateActiveCarSetup(
        { bodyId: newId },
        this.bodyNamesMap,
        this.trackNamesMap
      );
      await this.car.applySetup(prof.carSetup);
      this.populateBodySelect();
      this.refreshMenuUI();
      this.sound.speak(`Nuova carrozzeria 3D ${file.name.replace(/\.glb$/i, '')} montata sul telaio al banco box!`, 'high');
    });

    // Scheda 3: Regolazioni Radiocomando / Joypad & Copia Profili
    this.initControllerTabListeners();

    // Scheda 4: Replay Multicamera
    this.initReplayUI(closeMenu);

    // Scheda 5: Audio & Backup Configurazione (.json)
    this.initSystemAndBackupTab();

    this.refreshMenuUI();
  }

  switchMenuTab(tabId) {
    document.querySelectorAll('.menu-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach((p) => {
      p.classList.toggle('active', p.id === tabId);
    });
  }

  setDriveCameraMode(mode) {
    this.driveCameraMode = mode;
    if (this.orbit) {
      this.orbit.enabled = mode === 'pit_bench';
      if (mode === 'pit_bench') {
        this.camera.position.set(1.8, 1.55, 2.7);
        this.orbit.target.set(2.45, -0.05, -1.8);
      }
    }
    document.querySelectorAll('.cam-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.cam === mode);
    });
  }

  cycleDriveCameraMode() {
    const modes = ['stand_normal', 'stand_zoom', 'pit_bench', 'chase_drive'];
    const next = modes[(modes.indexOf(this.driveCameraMode) + 1) % modes.length];
    this.setDriveCameraMode(next);
  }

  triggerMarshalReset() {
    if (!this.trackData || !this.car) return;
    const pose = this.club.getNearestTrackPose(this.car.state.x, this.car.state.z);
    this.car.resetOnTrack(pose.x, pose.z, pose.heading);
    this.sound.speak('Intervento del commissario! Mini-Z rimessa dritta al centro della corsia.', 'high');
  }

  toggleNakedChassis() {
    const prof = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
    const nextVal = !prof.carSetup.showNakedChassis;
    this.profileManager.updateActiveCarSetup({ showNakedChassis: nextVal }, this.bodyNamesMap, this.trackNamesMap);
    this.car.setNakedChassisMode(nextVal);

    const txt = nextVal ? '🔍 Rimetti Carrozzeria' : '🔍 Togli Carrozzeria';
    const b1 = document.getElementById('btn-toggle-shell-quick');
    const b2 = document.getElementById('btn-Toggle-naked-chassis');
    if (b1) b1.textContent = txt;
    if (b2) b2.textContent = nextVal ? '🏎️ Rimetti Carrozzeria sopra il Telaio' : '🔍 Togli Carrozzeria (Vedi Telaio Nudo)';

    if (nextVal) {
      this.sound.speak('Carrozzeria smontata sul banco! Visibile il telaio Kyosho con batterie ministilo, molle e motore.', 'normal');
    }
  }

  populateBodySelect() {
    const selBody = document.getElementById('sel-body');
    if (!selBody) return;
    selBody.innerHTML = CAR_BODIES.map((b) => `<option value="${b.id}">${b.name} (${b.scaleLabel})</option>`).join('');
  }

  initWorkbenchSelectors() {
    const fillSelect = (id, list, labelFn = (x) => x.name) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = list.map((item) => `<option value="${item.id}">${labelFn(item)}</option>`).join('');
    };

    this.populateBodySelect();
    fillSelect('sel-chassis', CHASSIS_LIST);
    fillSelect('sel-front-tire', FRONT_TIRES);
    fillSelect('sel-rear-tire', REAR_TIRES);
    fillSelect('sel-motor', MOTORS);
    fillSelect('sel-pinion', PINIONS);
    fillSelect('sel-front-spring', FRONT_SPRINGS);
    fillSelect('sel-tplate', T_PLATES);
    fillSelect('sel-diff', DIFFERENTIALS);

    const bindSetupChange = (selectId, setupKey, announceMsgFn) => {
      document.getElementById(selectId)?.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (setupKey === 'bodyId') {
          this.profileManager.state.currentBodyId = val;
        }
        const activeProf = this.profileManager.updateActiveCarSetup(
          { [setupKey]: val },
          this.bodyNamesMap,
          this.trackNamesMap
        );
        await this.car.applySetup(activeProf.carSetup);
        this.refreshMenuUI();
        if (announceMsgFn) {
          this.sound.speak(announceMsgFn(val), 'normal');
        }
      });
    };

    bindSetupChange('sel-body', 'bodyId', (id) => {
      const b = CAR_BODIES.find((x) => x.id === id);
      return `Carrozzeria ${b ? b.name : ''} montata e pronta!`;
    });
    bindSetupChange('sel-chassis', 'chassisId', (id) => {
      const c = CHASSIS_LIST.find((x) => x.id === id);
      return `Cambio telaio ai box: selezionato ${c ? c.name : ''}.`;
    });
    bindSetupChange('sel-front-tire', 'frontTireId', (id) => {
      const t = FRONT_TIRES.find((x) => x.id === id);
      return `Montate gomme anteriori ${t ? t.name : ''}.`;
    });
    bindSetupChange('sel-rear-tire', 'rearTireId', (id) => {
      const t = REAR_TIRES.find((x) => x.id === id);
      return `Montate gomme posteriori ${t ? t.name : ''}.`;
    });
    bindSetupChange('sel-motor', 'motorId', (id) => {
      const m = MOTORS.find((x) => x.id === id);
      return `Installato nel banchino il motore ${m ? m.name : ''}!`;
    });
    bindSetupChange('sel-pinion', 'pinionId');
    bindSetupChange('sel-front-spring', 'frontSpringId', (id) => {
      const s = FRONT_SPRINGS.find((x) => x.id === id);
      return `Sostituite molle anteriori con ${s ? s.name : ''}.`;
    });
    bindSetupChange('sel-tplate', 'tPlateId');
    bindSetupChange('sel-diff', 'diffId');
  }

  initControllerTabListeners() {
    const sliders = [
      { id: 'rng-steer-exp', valId: 'val-steer-exp', key: 'steeringExp', suffix: '%' },
      { id: 'rng-steer-dr', valId: 'val-steer-dr', key: 'steeringDualRate', suffix: '%' },
      { id: 'rng-servo-speed', valId: 'val-servo-speed', key: 'servoSpeed', suffix: '%' },
      { id: 'rng-thr-exp', valId: 'val-thr-exp', key: 'throttleExp', suffix: '%' },
      { id: 'rng-brake-epa', valId: 'val-brake-epa', key: 'brakeStrength', suffix: '%' },
      { id: 'rng-deadzone', valId: 'val-deadzone', key: 'deadzone', suffix: '%' },
      { id: 'rng-steer-trim', valId: 'val-steer-trim', key: 'steeringTrim', suffix: '' }
    ];

    for (const s of sliders) {
      const el = document.getElementById(s.id);
      if (!el) continue;
      el.addEventListener('input', (e) => {
        const num = Number(e.target.value);
        const valEl = document.getElementById(s.valId);
        if (valEl) valEl.textContent = `${num > 0 && s.key.includes('Exp') ? '+' : ''}${num}${s.suffix}`;
        this.profileManager.updateActiveController({ [s.key]: num }, this.bodyNamesMap, this.trackNamesMap);
      });
    }

    document.getElementById('chk-inv-steer')?.addEventListener('change', (e) => {
      this.profileManager.updateActiveController({ invertSteering: e.target.checked }, this.bodyNamesMap, this.trackNamesMap);
    });
    document.getElementById('chk-inv-thr')?.addEventListener('change', (e) => {
      this.profileManager.updateActiveController({ invertThrottle: e.target.checked }, this.bodyNamesMap, this.trackNamesMap);
    });

    // Pulsanti "Premi per assegnare" (Calibrazione Joypad)
    document.querySelectorAll('.bind-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bind-btn').forEach((b) => b.classList.remove('listening'));
        btn.classList.add('listening');
        const field = btn.dataset.bindField;
        const type = btn.dataset.bindType;
        btn.textContent = type === 'pad_axis' ? 'Muovi ora la levetta/volantino...' : 'Premi ora il tasto sul Joypad...';

        this.controller.startListeningForBinding(field, type, (capturedField, index) => {
          btn.classList.remove('listening');
          this.profileManager.updateActiveController(
            { Bindings: { [capturedField]: index } },
            this.bodyNamesMap,
            this.trackNamesMap
          );
          this.refreshMenuUI();
        });
      });
    });

    // Copia e Applica Profilo Salvato all'Auto e Pista attuale
    const applySelectedProfile = async (mode) => {
      const sel = document.getElementById('sel-saved-profiles');
      if (!sel || !sel.value) return;
      const updated = this.profileManager.applySavedProfileToCurrent(
        sel.value,
        mode,
        this.bodyNamesMap,
        this.trackNamesMap
      );
      if (updated) {
        await this.car.applySetup(updated.carSetup);
        this.refreshMenuUI();
        this.sound.speak('Profilo applicato e salvato per questa auto e questa pista!', 'high');
      }
    };

    document.getElementById('btn-apply-profile-ctrl')?.addEventListener('click', () => applySelectedProfile('controller'));
    document.getElementById('btn-apply-profile-both')?.addEventListener('click', () => applySelectedProfile('both'));
  }

  initReplayUI(closeMenu) {
    const camContainer = document.getElementById('replay-cam-buttons');
    if (camContainer) {
      camContainer.innerHTML = REPLAY_CAMERAS.map(
        (c, idx) =>
          `<button type="button" class="replay-cam-btn ${idx === 0 ? 'active' : ''}" data-rcam="${c.id}">${c.name}</button>`
      ).join('');

      camContainer.querySelectorAll('.replay-cam-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.setReplayCamera(btn.dataset.rcam);
        });
      });
    }

    document.getElementById('btn-quick-replay')?.addEventListener('click', () => this.toggleReplayMode());
    document.getElementById('btn-close-replay')?.addEventListener('click', () => this.stopReplayMode());

    document.getElementById('btn-replay-playpause')?.addEventListener('click', (e) => {
      this.replay.isPlaying = !this.replay.isPlaying;
      e.target.textContent = this.replay.isPlaying ? '⏸ Pausa' : '▶️ Play';
    });

    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.replay.playbackSpeed = Number(btn.dataset.speed);
        document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('replay-scrubber')?.addEventListener('input', (e) => {
      const pct = Number(e.target.value) / 100;
      this.replay.cursor = pct * Math.max(0, this.replay.frames.length - 1);
    });

    document.getElementById('btn-start-replay-from-menu')?.addEventListener('click', () => {
      closeMenu();
      this.startReplayMode();
    });
  }

  setReplayCamera(camId) {
    this.replay.setCameraMode(camId);
    document.querySelectorAll('.replay-cam-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.rcam === camId);
    });
    this.refreshMenuUI();
  }

  startReplayMode() {
    if (this.replay.startReplay()) {
      document.getElementById('replay-bar')?.classList.remove('hidden');
      this.sound.speak('Regia Replay attivata! Scegli una delle 5 telecamere a bordo pista.', 'normal');
    } else {
      this.sound.speak('Percorri almeno qualche metro in pista per registrare il Replay!', 'normal');
    }
  }

  stopReplayMode() {
    this.replay.stopReplay();
    document.getElementById('replay-bar')?.classList.add('hidden');
  }

  toggleReplayMode() {
    if (this.replay.isActive) this.stopReplayMode();
    else this.startReplayMode();
  }

  initSystemAndBackupTab() {
    // Esporta tutta la configurazione in un file .json
    const feedback = document.getElementById('backup-status-msg');
    document.getElementById('btn-export-config')?.addEventListener('click', () => {
      this.profileManager.exportFullConfigJson();
      if (feedback) feedback.textContent = '✅ Configurazione completa scaricata con successo!';
      this.sound.speak('Backup completo della configurazione salvato sul tuo computer!', 'normal');
    });

    // Importa e ripristina tutta la configurazione da file .json
    document.getElementById('input-import-config')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await this.profileManager.importFullConfigJson(file);
        this.applyGraphicsQuality(this.profileManager.state.graphicsQuality, false);
        this.loadActiveTrack(true);
        const prof = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
        await this.car.applySetup(prof.carSetup);
        this.refreshMenuUI();
        if (feedback) feedback.textContent = '✅ Tutte le impostazioni, i profili e i record sono stati ripristinati!';
        this.sound.speak('Configurazione ripristinata con successo! Tutti i tuoi profili sono pronti.', 'high');
      } catch (err) {
        if (feedback) feedback.textContent = '❌ File non valido: seleziona un file di backup .json del simulatore.';
      }
    });

    // Audio e Telecronaca
    document.getElementById('chk-commentary-enabled')?.addEventListener('change', (e) => {
      this.profileManager.state.audio.commentaryEnabled = e.target.checked;
      this.profileManager.save();
    });

    document.getElementById('rng-vol-comm')?.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      document.getElementById('val-vol-comm').textContent = `${v}%`;
      this.profileManager.state.audio.commentaryVolume = v / 100;
      this.profileManager.save();
    });

    document.getElementById('rng-vol-motor')?.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      document.getElementById('val-vol-motor').textContent = `${v}%`;
      this.profileManager.state.audio.motorVolume = v / 100;
      this.profileManager.save();
    });
  }

  refreshMenuUI() {
    const state = this.profileManager.state;
    const activeProf = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
    const setup = activeProf.carSetup;
    const ctrl = activeProf.controller;

    const bodyName = this.bodyNamesMap[state.currentBodyId] || state.currentBodyId;
    const trackName = this.trackNamesMap[state.currentTrackId] || state.currentTrackId;
    const profileLabel = `${bodyName} • ${trackName}`;

    const topSub = document.getElementById('hud-active-profile-label');
    if (topSub) topSub.textContent = profileLabel;

    const menuInd = document.getElementById('menu-profile-indicator');
    if (menuInd) menuInd.textContent = `Profilo salvato in automatico per: ${profileLabel}`;

    // Scheda 1: Carte Piste RCP
    const tracksGrid = document.getElementById('track-cards-grid');
    if (tracksGrid) {
      tracksGrid.innerHTML = TRACK_LAYOUTS.map((t) => {
        const rec = state.lapRecords[t.id];
        const recStr = rec ? `🏆 Record: ${rec.timeSec.toFixed(2)}s` : 'Nessun giro registrato';
        const isAct = t.id === state.currentTrackId;
        return `
          <div class="choice-card ${isAct ? 'active' : ''}" data-track-id="${t.id}">
            <h4>${t.name}</h4>
            <div class="card-meta">${t.dimensionsLabel} • ${recStr}</div>
            <p>${t.description}</p>
          </div>
        `;
      }).join('');

      tracksGrid.querySelectorAll('.choice-card').forEach((card) => {
        card.addEventListener('click', async () => {
          state.currentTrackId = card.dataset.trackId;
          this.profileManager.save();
          this.loadActiveTrack(true);
          const prof = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
          await this.car.applySetup(prof.carSetup);
          this.refreshMenuUI();
          this.sound.speak(`Pista cambiata: ${this.trackNamesMap[state.currentTrackId]}!`, 'high');
        });
      });
    }

    const chkRev = document.getElementById('chk-reverse-track');
    if (chkRev) chkRev.checked = Boolean(state.reverseTrack);

    // Scheda 2: Valori Banco Box e descrizioni
    const setSelectAndDesc = (selId, descId, val, list) => {
      const sel = document.getElementById(selId);
      if (sel) sel.value = val;
      const descEl = document.getElementById(descId);
      if (descEl && list) {
        const found = list.find((x) => x.id === val);
        descEl.textContent = found ? found.description : '';
      }
    };

    setSelectAndDesc('sel-body', 'desc-body', setup.bodyId, CAR_BODIES);
    setSelectAndDesc('sel-chassis', 'desc-chassis', setup.chassisId, CHASSIS_LIST);
    setSelectAndDesc('sel-front-tire', 'desc-front-tire', setup.frontTireId, FRONT_TIRES);
    setSelectAndDesc('sel-rear-tire', 'desc-rear-tire', setup.rearTireId, REAR_TIRES);
    setSelectAndDesc('sel-motor', 'desc-motor', setup.motorId, MOTORS);
    setSelectAndDesc('sel-pinion', null, setup.pinionId, PINIONS);
    setSelectAndDesc('sel-front-spring', 'desc-front-spring', setup.frontSpringId, FRONT_SPRINGS);
    setSelectAndDesc('sel-tplate', 'desc-tplate', setup.tPlateId, T_PLATES);
    setSelectAndDesc('sel-diff', 'desc-diff', setup.diffId, DIFFERENTIALS);

    // Scheda 3: Sliders Controller e lista Profili Salvati
    const setSlider = (id, valId, val, suffix = '%') => {
      const el = document.getElementById(id);
      if (el) el.value = val;
      const vEl = document.getElementById(valId);
      if (vEl) vEl.textContent = `${val}${suffix}`;
    };

    setSlider('rng-steer-exp', 'val-steer-exp', ctrl.steeringExp, '%');
    setSlider('rng-steer-dr', 'val-steer-dr', ctrl.steeringDualRate, '%');
    setSlider('rng-servo-speed', 'val-servo-speed', ctrl.servoSpeed, '%');
    setSlider('rng-thr-exp', 'val-thr-exp', ctrl.throttleExp, '%');
    setSlider('rng-brake-epa', 'val-brake-epa', ctrl.brakeStrength, '%');
    setSlider('rng-deadzone', 'val-deadzone', ctrl.deadzone, '%');
    setSlider('rng-steer-trim', 'val-steer-trim', ctrl.steeringTrim, '');

    const invS = document.getElementById('chk-inv-steer');
    if (invS) invS.checked = Boolean(ctrl.invertSteering);
    const invT = document.getElementById('chk-inv-thr');
    if (invT) invT.checked = Boolean(ctrl.invertThrottle);

    // Etichette pulsanti mappatura Joypad
    const b = ctrl.Bindings;
    const setTxt = (id, t) => {
      const e = document.getElementById(id);
      if (e) e.textContent = t;
    };
    setTxt('lbl-padSteerAxis', `${b.padSteerAxis}`);
    setTxt('lbl-padThrottleBtn', `${b.padThrottleBtn}`);
    setTxt('lbl-padBrakeBtn', `${b.padBrakeBtn}`);
    setTxt('lbl-padMarshalBtn', `${b.padMarshalBtn}`);
    setTxt('lbl-padCameraBtn', `${b.padCameraBtn}`);

    // Menu a tendina di tutti i profili salvati (per copiarli/applicarli ad altre auto e piste)
    const profSelect = document.getElementById('sel-saved-profiles');
    if (profSelect) {
      const allProfs = this.profileManager.getAllProfilesList();
      profSelect.innerHTML = allProfs
        .map((p) => {
          const bName = this.bodyNamesMap[p.bodyId] || p.bodyId;
          const tName = this.trackNamesMap[p.trackId] || p.trackId;
          return `<option value="${p.key}">📌 ${bName} su ${tName}</option>`;
        })
        .join('');
    }

    // Scheda 4: Telecamere Replay nel menu
    const replayGrid = document.getElementById('menu-replay-cams-grid');
    if (replayGrid) {
      replayGrid.innerHTML = REPLAY_CAMERAS.map(
        (c) => `
          <div class="choice-card ${this.replay.cameraMode === c.id ? 'active' : ''}" data-rcam-card="${c.id}">
            <h4>${c.name}</h4>
            <div class="card-meta">Inquadratura Replay</div>
            <p>Seleziona questa inquadratura per rivedere le traiettorie e il lavoro delle sospensioni.</p>
          </div>
        `
      ).join('');

      replayGrid.querySelectorAll('.choice-card').forEach((card) => {
        card.addEventListener('click', () => {
          this.setReplayCamera(card.dataset.rcamCard);
        });
      });
    }
  }

  updateTimingHUD() {
    const fmt = (t) => (t !== null && t !== undefined ? `${t.toFixed(2)}s` : '--.--s');
    const lapNumEl = document.getElementById('hud-lap-num');
    const curEl = document.getElementById('hud-cur-lap');
    const lastEl = document.getElementById('hud-last-lap');
    const bestEl = document.getElementById('hud-best-lap');

    if (lapNumEl) lapNumEl.textContent = `${this.lapNumber}`;
    if (curEl) curEl.textContent = `${this.currentLapSec.toFixed(2)}s`;
    if (lastEl) lastEl.textContent = fmt(this.lastLapSec);
    if (bestEl) bestEl.textContent = fmt(this.bestLapSec);
  }

  // Aggiorna la visuale dal Palco Piloti con la stessa identica inquadratura, altezza e prospettiva di Slot-Car!
  updateDriverCamera(dt) {
    const carPos = new THREE.Vector3(this.car.state.x, this.car.state.y + 0.025, this.car.state.z);

    if (this.driveCameraMode === 'pit_bench') {
      // Visuale libera Orbit nella sala (come "Ruota" in Slot-Car)
      if (this.orbit) {
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
        this.orbit.update();
      }
      return;
    }

    if (this.driveCameraMode === 'chase_drive') {
      const fwd = new THREE.Vector3(Math.sin(this.car.state.heading), 0, Math.cos(this.car.state.heading));
      const desired = carPos.clone().addScaledVector(fwd, -0.52).add(new THREE.Vector3(0, 0.22, 0));
      this.camera.position.lerp(desired, Math.min(1, dt * 10));
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(carPos.clone().addScaledVector(fwd, 0.25));
      return;
    }

    if (this.driveCameraMode === 'stand_zoom') {
      // Visuale Dall'Alto / Panoramica Tavolo (come "Dall'alto" in Slot-Car)
      this.camera.position.set(2.45, 7.6, -1.85);
      this.camera.fov = 48;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(2.45, 0, -1.9);
      return;
    }

    // VISUALE PALCO PILOTI (identica a Slot-Car: occhi a y = ROST.top + 1.64 = +1.24m sopra il tavolo, z = ROST.z0 + 0.36 = 1.91m, fov = 50°)
    this.camera.position.set(2.45, ROST.top + 1.64, ROST.z0 + 0.36);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();

    const look = new THREE.Vector3(2.45, 0, -1.8).lerp(carPos, 0.35);
    keepDriverCarVisible(this.camera, look, carPos);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    // 1. Calcolo FPS in tempo reale per il riquadrino in alto
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 450) {
      this.currentFps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;

      const fpsValEl = document.getElementById('hud-fps-val');
      const fpsDotEl = document.getElementById('fps-dot');
      if (fpsValEl) fpsValEl.textContent = `${this.currentFps} FPS`;
      if (fpsDotEl) {
        fpsDotEl.className =
          'fps-dot ' + (this.currentFps >= 50 ? 'green' : this.currentFps >= 30 ? 'yellow' : 'red');
      }
    }

    // 2. Lettura Joypad / Radiocomando / Tastiera
    const input = this.controller.update(dt);

    // Aggiorna barre di test e indicatori controller
    const steerPct = clamp(50 + input.steer * 45, 2, 98);
    const thrPct = clamp(Math.max(input.throttle, input.brake) * 100, 0, 100);
    const hudSteer = document.getElementById('hud-steer-bar');
    const hudThr = document.getElementById('hud-thr-bar');
    const menuSteer = document.getElementById('menu-test-steer');
    const menuThr = document.getElementById('menu-test-thr');

    if (hudSteer) hudSteer.style.width = `${steerPct}%`;
    if (hudThr) hudThr.style.width = `${thrPct}%`;
    if (menuSteer) menuSteer.style.width = `${steerPct}%`;
    if (menuThr) menuThr.style.width = `${thrPct}%`;

    const padStatus = document.getElementById('hud-controller-status');
    const menuPadBanner = document.getElementById('pad-detected-banner');
    if (this.controller.connectedGamepadName) {
      const shortName = this.controller.connectedGamepadName.slice(0, 38);
      if (padStatus) padStatus.textContent = `🎮 Joypad Attivo: ${shortName}`;
      if (menuPadBanner) menuPadBanner.textContent = `✅ Joypad collegato: ${this.controller.connectedGamepadName}`;
    }

    // 3. Se siamo in modalità Replay Multicamera, riproduce il Replay
    if (this.replay.isActive) {
      const rFrame = this.replay.update(dt, this.camera, this.trackData, this.club.driverEyePos);
      if (rFrame) {
        this.car.applyReplayFrame(rFrame);
        const scrubber = document.getElementById('replay-scrubber');
        if (scrubber) scrubber.value = Math.round(rFrame.progressPercent);
      }
      this.club.animateCharacters(
        now * 0.001,
        this.car.rootGroup.position,
        this.sound.isSpeaking,
        dt,
        this.camera.position,
        input.throttle
      );
      this.qualityComposer.render();
      return;
    }

    // 4. Avanzamento Fisica Mini-Z (2 sotto-passi per massima precisione)
    const subSteps = 2;
    const subDt = dt / subSteps;
    for (let s = 0; s < subSteps; s++) {
      this.car.updatePhysics(
        subDt,
        input,
        this.trackData,
        (hitSpeed) => {
          if (hitSpeed > 0.7) {
            this.sound.playBarrierHit(hitSpeed * 0.35);
            if (hitSpeed > 1.85) this.sound.commentWallHit(true);
          }
        },
        () => {
          this.sound.commentFlipMarshal();
        }
      );

      // Controllo passaggio sotto il Ponte di Cronometraggio IC-Tag
      const crossEvent = this.trackData.checkLapCrossing(this.car.state.x, this.car.state.z);
      if (crossEvent === 'timer_started') {
        this.timerRunning = true;
        this.lapStartTime = now;
        this.lapNumber = 1;
        this.sound.playLapBeep(false);
        this.sound.speak('Cronometro avviato! Primo giro lanciato!', 'normal');
      } else if (crossEvent === 'lap_completed' && this.timerRunning) {
        const lapSec = (now - this.lapStartTime) / 1000;
        if (lapSec >= 2.8) {
          this.lastLapSec = lapSec;
          const prevBest = this.bestLapSec;
          const isRecord = this.profileManager.recordLapTime(
            this.profileManager.state.currentTrackId,
            lapSec,
            this.profileManager.state.currentBodyId
          );
          if (isRecord) this.bestLapSec = lapSec;

          const delta = prevBest ? lapSec - prevBest : null;
          this.sound.playLapBeep(isRecord);
          this.sound.commentLap(this.lapNumber, lapSec, isRecord, delta);

          this.lapNumber++;
          this.lapStartTime = now;
          this.club.updateBridgeDisplay(this.lapNumber, this.lastLapSec, this.bestLapSec);
        }
      }
    }

    if (this.timerRunning) {
      this.currentLapSec = (now - this.lapStartTime) / 1000;
    }
    this.updateTimingHUD();

    // Commenti dinamici in gara (Traversi Drift o Velocità massima sul rettilineo sotto il palco)
    if (this.car.state.slipAmount > 0.58 && Math.abs(this.car.state.speed) > 1.8 && Math.random() < dt * 0.45) {
      this.sound.commentDrift();
    } else if (
      this.car.state.z > 1.15 &&
      Math.abs(this.car.state.speed) > 5.4 &&
      Math.random() < dt * 0.25
    ) {
      const bName = this.bodyNamesMap[this.profileManager.state.currentBodyId] || 'Mini-Z';
      this.sound.commentStraightSpeed(bName);
    }

    // 5. Aggiorna Suono Motore e Tachimetro (km/h reali + km/h in scala 1:27!)
    const activeSetup = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap).carSetup;
    const motorSpec = MOTORS.find((m) => m.id === activeSetup.motorId) || MOTORS[2];
    const speedRatio = Math.abs(this.car.state.speed) / motorSpec.maxSpeedMs;
    this.sound.updateMotorSound(speedRatio, input.throttle, this.car.state.slipAmount, motorSpec);

    const realKmh = Math.abs(this.car.state.speed) * 3.6;
    const scaleKmh = Math.round(realKmh * 27);
    const realEl = document.getElementById('hud-speed-real');
    const scaleEl = document.getElementById('hud-speed-scale');
    if (realEl) realEl.textContent = realKmh.toFixed(1);
    if (scaleEl) scaleEl.textContent = `${scaleKmh}`;

    // 6. Registra frame per il Replay Multicamera
    this.replay.recordFrame(this.car.state, this.currentLapSec);

    // 7. Aggiorna Visuale dal Palco e Personaggi animati nella sala
    this.updateDriverCamera(dt);
    this.club.animateCharacters(
      now * 0.001,
      this.car.rootGroup.position,
      this.sound.isSpeaking,
      dt,
      this.camera.position,
      input.throttle
    );

    this.qualityComposer.render();
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

window.addEventListener('DOMContentLoaded', () => {
  new MiniZSimulatorApp();
});
