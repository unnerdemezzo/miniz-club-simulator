import * as THREE from 'three';
import {
  CAR_BODIES,
  CAR_CATEGORIES,
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
import { ProfileManager, CONTROLLER_PRESETS, MODE_PRESET } from './storage/ProfileManager.js';
import { ControllerManager } from './input/ControllerManager.js';
import { SoundAndCommentary } from './audio/SoundAndCommentary.js';
import { ReplaySystem, REPLAY_CAMERAS } from './replay/ReplaySystem.js';
import { ClubEnvironment } from './world/ClubEnvironment.js';
import { MiniZCar } from './car/MiniZCar.js';
import { DRIVERS, ROST } from './club/config.js';
import { RaceStandings } from './ui/RaceStandings.js';
import { keepDriverCarVisible } from './club/driver-framing.js';
import { createQualityComposer } from './club/graphics-quality.js';
import { setAniso } from './club/util.js';
import { setHdLiveryQuality } from './car/hd-livery.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { APP_VERSION } from './version.js';
import { startWithAccess } from './access/access-gate.js';
import { DEMO, protectDemoStorage, applyDemoState, installDemoUi } from './access/demo-mode.js';

class MiniZSimulatorApp {
  constructor({ demo = false } = {}) {
    // Demo senza codice: una pista, un'auto, gara a tempo di 3 minuti, nessun salvataggio (src/access/demo-mode.js)
    this.demo = demo;
    if (demo) protectDemoStorage();
    this.profileManager = new ProfileManager();
    if (demo) {
      applyDemoState(this.profileManager.state);
      installDemoUi();
    }
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


    // Fase della sessione: 'setup' (schermata impostazioni, auto non in pista) → 'countdown' (semaforo)
    // → 'racing' → 'finished' (bandiera a scacchi). Si parte sempre dalle impostazioni.
    this.racePhase = 'setup';
    this.raceStartTime = 0;
    this.raceElapsedSec = 0;
    this.raceTimeExpired = false;
    this.sessionBestLapSec = null;
    this.countdownTimers = [];

    this.initPWA();
    this.initThreeScene();
    this.bootSimulator();
  }

  // App installabile, come in Slot Car: Chrome/Edge/Android offrono il prompt (beforeinstallprompt, tenuto da parte
  // già in index.html se arriva prima del gioco); su iPhone/iPad si usa "Condividi → Aggiungi alla schermata Home".
  initPWA() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`)
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => {});
    }
    this.isIOS =
      /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.deferredInstallPrompt = window.__minizInstallPrompt || null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      this.updateInstallVisibility();
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = window.__minizInstallPrompt = null;
      this.updateInstallVisibility();
    });
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => this.updateInstallVisibility());
  }

  isRunningAsInstalledApp() {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
      window.navigator.standalone === true
    );
  }

  // Il pulsante "Installa App" (sempre facoltativo) compare nella schermata iniziale e nella barra in alto solo
  // quando l'installazione si può davvero fare: prompt del browser disponibile oppure iPhone/iPad. Sparisce
  // quando l'app è installata. Nel menu Sistema il pulsante resta, con lo stato spiegato sotto.
  updateInstallVisibility() {
    const installed = this.isRunningAsInstalledApp();
    const can = !installed && (Boolean(this.deferredInstallPrompt) || this.isIOS);
    document.getElementById('setup-install-box')?.classList.toggle('hidden', !can);
    document.getElementById('btn-install-app')?.classList.toggle('hidden', !can);
    if (!can) document.querySelectorAll('.install-ios-hint').forEach((el) => el.classList.add('hidden'));
    const status = document.getElementById('install-menu-status');
    if (status) {
      status.textContent = installed
        ? '✅ L\'app è già installata su questo dispositivo.'
        : this.deferredInstallPrompt
          ? 'Funziona anche senza internet una volta installata.'
          : this.isIOS
            ? ''
            : 'Questo browser non offre ora l\'installazione: usa Chrome o Edge (icona "Installa" nella barra degli indirizzi) oppure, se l\'hai già installata, aprila dalle tue app.';
    }
  }

  async handleInstallClick() {
    if (this.deferredInstallPrompt) {
      const prompt = this.deferredInstallPrompt;
      this.deferredInstallPrompt = window.__minizInstallPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (e) {
        // Prompt già usato o rifiutato dal browser: si riproverà quando lo riproporrà
      }
      this.updateInstallVisibility();
      return;
    }
    if (this.isIOS) {
      document.querySelectorAll('.install-ios-hint').forEach((el) => el.classList.toggle('hidden'));
    }
  }

  initThreeScene() {
    this.canvas = document.getElementById('sim-canvas');
    this.scene = new THREE.Scene();
    // Stesso fondo di Slot-Car (js/main.js), senza nebbia: la sala è chiusa e tutta a fuoco
    this.scene.background = new THREE.Color(0x1a1c20);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.03, 50);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Come Slot-Car: filtro anisotropico al massimo che la GPU consente (fino a 16×), per pista e carrozzerie viste di sbieco
    setAniso(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));

    // Controlli Orbit per la visuale libera in Sala ("Ruota in Sala")
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(2.45, -0.05, -1.8);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.07;
    this.orbit.maxDistance = 12;
    this.orbit.minDistance = 0.25;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.orbit.enabled = false;

    // Illuminazione come in Slot-Car (js/club.js): una sola luce principale calda 0xfff2e0 da 1,4 più i riflessi
    // della sala (scene.environment in ClubEnvironment). Niente luce emisferica né faretti di riempimento.
    // Luce principale dal soffitto: ombre della sala (tavolo, persone, arredi), inquadrata sul solo tavolo pista
    // (10,5 × 6,2 m) invece che su 17 × 14 m, così ogni pixel d'ombra copre circa 5 mm invece di 8.
    // Stessa direzione del sole di Slot-Car (js/club.js, da 9 m quasi a picco): illumina in pieno i cofani e le livree,
    // che dal palco sono la parte più visibile delle auto, e accorcia le ombre come nel club vero.
    this.mainCeilingLight = new THREE.DirectionalLight(0xfff2e0, 1.0);
    this.mainCeilingLight.position.set(1.4, 9, 2.4);
    this.mainCeilingLight.target.position.set(2.4, 0, -1.9);
    this.mainCeilingLight.castShadow = true;
    this.mainCeilingLight.shadow.mapSize.set(2048, 2048);
    this.mainCeilingLight.shadow.camera.left = -6.4;
    this.mainCeilingLight.shadow.camera.right = 6.4;
    this.mainCeilingLight.shadow.camera.top = 5.2;
    this.mainCeilingLight.shadow.camera.bottom = -5.2;
    this.mainCeilingLight.shadow.camera.near = 5;
    this.mainCeilingLight.shadow.camera.far = 15;
    this.mainCeilingLight.shadow.bias = -0.0003;
    this.mainCeilingLight.shadow.normalBias = 0.012;
    this.scene.add(this.mainCeilingLight);
    this.scene.add(this.mainCeilingLight.target);

    // Quota della stessa luce dedicata all'ombra nitida della Mini-Z: stessa direzione, frustum di 1,4 m
    // che segue l'auto (circa 1,4 mm per pixel). La somma delle due intensità è 1,4 come in Slot-Car.
    this.carShadowLight = new THREE.DirectionalLight(0xfff2e0, 0.4);
    this.carShadowLight.castShadow = true;
    this.carShadowLight.shadow.mapSize.set(1024, 1024);
    this.carShadowLight.shadow.camera.left = -0.7;
    this.carShadowLight.shadow.camera.right = 0.7;
    this.carShadowLight.shadow.camera.top = 0.7;
    this.carShadowLight.shadow.camera.bottom = -0.7;
    this.carShadowLight.shadow.camera.near = 8;
    this.carShadowLight.shadow.camera.far = 12;
    this.carShadowLight.shadow.bias = -0.0002;
    this.carShadowLight.shadow.normalBias = 0.002;
    this.carShadowLightOffset = new THREE.Vector3().subVectors(
      this.mainCeilingLight.position,
      this.mainCeilingLight.target.position
    );
    this.scene.add(this.carShadowLight);
    this.scene.add(this.carShadowLight.target);

    // Profili di qualità: risoluzione, ombre, shadow map ed effetti fotografici di Slot-Car (AO, bloom)
    this.qualityComposer = createQualityComposer(this.renderer, this.scene, this.camera, this.mainCeilingLight, [
      this.carShadowLight
    ]);

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

    try {
      setProgress(15, 'Allestimento sala del Club Mini-Z, pedana piloti, officina 3 banchi e direzione gara...');
      this.club = new ClubEnvironment(this.scene, this.renderer);
      this.club.setAiDifficulty(this.profileManager.state.aiLevel || 'club');

      setProgress(35, 'Montaggio tappeto in gomma Kyosho RCP Track (mattonelle 50×50cm)...');
      this.loadActiveTrack(false);

      setProgress(45, 'Caricamento modello 3D Ferrari 499P Hypercar e telaio Kyosho Mini-Z (17,2 cm)...');
      this.car = new MiniZCar(this.scene, (glbPct) => {
        const totalPct = Math.min(98, 45 + Math.round(glbPct * 0.52));
        setProgress(totalPct, `Calibrazione carrozzeria 3D in scala 1:27 (${glbPct}%)...`);
      });
      if (this.club.playerWorkbenchPose) {
        this.car.workbenchPose = { ...this.club.playerWorkbenchPose };
      }

      const activeProfile = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
      await this.car.applySetup(activeProfile.carSetup);
      this.car.resetOnTrack(this.trackData.startX, this.trackData.startZ, this.trackData.startHeading);

      // Applica la modalità di risoluzione grafica salvata
      this.applyGraphicsQuality(this.profileManager.state.graphicsQuality, false);
    } catch (err) {
      console.error('Errore durante il caricamento iniziale:', err);
    }

    // Inizializza l'interfaccia utente e il menu a 5 schede
    this.initUI();

    setProgress(100, 'Sala pronta! Scegli auto, pista e tipo di gara.');
    this.showRaceSetup();
    setTimeout(() => {
      const loader = document.getElementById('loading-screen');
      if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.classList.add('hidden'), 450);
      }
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
    setHdLiveryQuality(q === 'high');

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
    this.initStandingsUI();

    // Versione app
    for (const id of ['hud-version-val', 'loading-version', 'setup-version']) {
      const verEl = document.getElementById(id);
      if (verEl) verEl.textContent = `v${APP_VERSION}`;
    }

    // Pulsanti 3 modalità di risoluzione grafica
    document.querySelectorAll('.res-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.applyGraphicsQuality(btn.dataset.quality, true);
      });
    });

    // Pulsante Installa App (schermata iniziale, barra superiore e scheda sistema)
    const handleInstallClick = () => this.handleInstallClick();
    document.getElementById('btn-install-app')?.addEventListener('click', handleInstallClick);
    document.getElementById('btn-install-app-menu')?.addEventListener('click', handleInstallClick);
    document.getElementById('btn-install-app-start')?.addEventListener('click', handleInstallClick);
    this.updateInstallVisibility();

    // Schermata impostazioni gara (avvio) e risultati
    this.initRaceSetupUI();

    // Apertura/chiusura Menu Unico
    const menuModal = document.getElementById('main-menu-modal');
    const openMenu = (tabId = null) => {
      this.refreshMenuUI();
      menuModal.classList.remove('hidden');
      const targetTab = tabId || document.querySelector('.menu-tab-btn.active')?.dataset.tab || 'tab-track';
      this.switchMenuTab(targetTab);
    };
    const closeMenu = () => {
      this.controller.cancelListening();
      menuModal.classList.add('hidden');
      menuModal.classList.remove('workbench-docked');
      if (this.car?.onWorkbench) {
        // Quando si torna in pista, rimette sempre la carrozzeria montata sull'auto!
        const prof = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
        if (prof.carSetup.showNakedChassis) {
          this.profileManager.updateActiveCarSetup({ showNakedChassis: false }, this.bodyNamesMap, this.trackNamesMap);
          this.car.setNakedChassisMode(false);
        }
        this.car.setWorkbenchMode(false);
        if (this.driveCameraMode === 'workbench') {
          this.setDriveCameraMode(this.previousDriveCameraMode || 'stand_normal');
        }
      }
    };

    document.getElementById('btn-open-menu')?.addEventListener('click', () => openMenu());
    document.getElementById('btn-open-workbench-quick')?.addEventListener('click', () => openMenu('tab-workbench'));
    document.getElementById('btn-setup-display')?.addEventListener('click', () => openMenu('tab-system'));
    document.getElementById('btn-close-menu')?.addEventListener('click', closeMenu);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.racePhase === 'setup') return;
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

    // Pulsanti Riavvia Gara (Spazio), Chiama Commissario (R) e Togli Carrozzeria rapido
    const onTrack = () => this.racePhase !== 'setup';
    this.controller.onMarshalPressed = () => onTrack() && this.triggerMarshalReset();
    this.controller.onRestartRacePressed = () => onTrack() && this.restartRace();
    this.controller.onCameraPressed = () => onTrack() && this.cycleDriveCameraMode();
    this.controller.onReplayPressed = () => onTrack() && this.toggleReplayMode();
    this.controller.onDevicesChanged = () => {
      this.refreshGamepadDeviceSelect();
      this.refreshHardwareUI();
    };

    document.getElementById('btn-restart-race')?.addEventListener('click', () => this.restartRace());
    document.getElementById('btn-marshal-reset')?.addEventListener('click', () => this.triggerMarshalReset());
    document.getElementById('btn-race-settings')?.addEventListener('click', () => this.showRaceSetup());
    document.getElementById('btn-Toggle-naked-chassis')?.addEventListener('click', () => this.toggleNakedChassis());
    document.getElementById('btn-refill-batteries')?.addEventListener('click', () => {
      this.car?.refillBatteries();
      this.sound.speak('Quattro batterie ministilo AAA Ni-MH Speed House caricate al massimo: 5 virgola 60 Volt!', 'high');
    });
    document.getElementById('btn-replace-tires')?.addEventListener('click', () => {
      this.car?.replaceTires();
      this.sound.speak('Treno di gomme nuove Kyosho montato sul telaio: battistrada al cento per cento!', 'high');
    });

    document.getElementById('sel-gamepad-device')?.addEventListener('change', (e) => {
      this.controller.preferredDevice = e.target.value;
      this.controller.selectActivePad();
      this.refreshGamepadDeviceSelect();
    });

    // Scheda 1: Piste RCP, livello avversari IA (con pulsanti rapidi in alto + menu) e inversione direzione
    const aiSel = document.getElementById('sel-ai-difficulty');
    const syncAiButtons = (lvl) => {
      if (aiSel) aiSel.value = lvl;
      document.querySelectorAll('.ai-mode-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.ai === lvl);
      });
    };
    const applyAiLevel = (lvl, speakIt = false) => {
      this.profileManager.state.aiLevel = lvl;
      this.profileManager.save();
      this.club?.setAiDifficulty(lvl);
      syncAiButtons(lvl);
      if (speakIt) {
        const labels = {
          none: 'Pista libera senza avversari!',
          beginner: 'Avversari impostati su livello Principiante: commettono spesso errori in staccata.',
          club: 'Avversari impostati su livello Club Amatoriale.',
          expert: 'Avversari impostati su livello Esperto Nazionale.',
          pro: 'Avversari impostati su livello Campione Pro!'
        };
        this.sound.speak(labels[lvl] || 'Livello avversari aggiornato.', 'normal');
      }
    };
    syncAiButtons(this.profileManager.state.aiLevel || 'club');
    if (aiSel) {
      aiSel.addEventListener('change', (e) => applyAiLevel(e.target.value, true));
    }
    document.querySelectorAll('.ai-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyAiLevel(btn.dataset.ai, true));
    });

    if (this.club) {
      this.lastAiMistakeAnnounce = 0;
      this.club.onAiMistake = (driverName, errType) => {
        const now = performance.now();
        if (now - this.lastAiMistakeAnnounce < 9500) return;
        this.lastAiMistakeAnnounce = now;
        const msg =
          errType === 'late_brake'
            ? `Attenzione! ${driverName} arriva lungo in staccata e allarga verso la sponda!`
            : errType === 'oversteer_wiggle'
              ? `Sbavatura di ${driverName} in uscita di curva: scoda e deve correggere di sterzo!`
              : `${driverName} pizzica il cordolo interno e perde velocità!`;
        this.sound.speak(msg, 'low');
      };
    }

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
    this.initDisplaySettingsUI();
    this.initVoiceSettingsUI();

    this.refreshMenuUI();
  }

  switchMenuTab(tabId) {
    document.querySelectorAll('.menu-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach((p) => {
      p.classList.toggle('active', p.id === tabId);
    });

    const menuModal = document.getElementById('main-menu-modal');
    const isWorkbench = tabId === 'tab-workbench';
    if (menuModal) {
      menuModal.classList.toggle('workbench-docked', isWorkbench);
    }

    if (this.car) {
      if (isWorkbench) {
        if (this.driveCameraMode !== 'workbench') {
          this.previousDriveCameraMode = this.driveCameraMode;
        }
        this.car.setWorkbenchMode(true, this.club?.playerWorkbenchPose || null);
        this.setDriveCameraMode('workbench');
      } else if (this.car.onWorkbench) {
        this.car.setWorkbenchMode(false);
        this.setDriveCameraMode(this.previousDriveCameraMode || 'stand_normal');
      }
    }
  }

  setDriveCameraMode(mode) {
    this.driveCameraMode = mode;
    if (this.orbit) {
      this.orbit.enabled = mode === 'pit_bench' || mode === 'workbench';
      if (mode === 'pit_bench') {
        this.orbit.minDistance = 0.25;
        this.orbit.maxDistance = 12;
        this.camera.position.set(1.8, 1.55, 2.7);
        this.orbit.target.set(2.45, -0.15, -1.8);
      } else if (mode === 'workbench') {
        const bp = this.car?.workbenchPose || { x: -5.05, y: 0.1052, z: -2.77 };
        this.orbit.minDistance = 0.14;
        this.orbit.maxDistance = 0.90;
        // Inquadra il banco lavoro illuminato mostrando il telaio MR-04 appoggiato sul cavalletto anodizzato, le ruote di ricambio, il caricabatterie 4xAAA, i cacciaviti Hudy/MIP e il vassoio magnetico!
        this.camera.position.set(bp.x + 0.36, bp.y + 0.21, bp.z + 0.26);
        this.orbit.target.set(bp.x + 0.02, bp.y + 0.005, bp.z + 0.01);
        this.orbit.update();
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

  restartRace() {
    if (!this.trackData || !this.car || this.racePhase === 'setup') return;
    this.beginRace();
  }

  // ================= SESSIONE DI GARA: IMPOSTAZIONI → SEMAFORO → GARA → RISULTATI =================

  getRaceSettings() {
    const st = this.profileManager.state;
    const rs = st.raceSettings || {};
    if (this.demo) return { mode: DEMO.mode, laps: 10, minutes: DEMO.minutes };
    return {
      mode: ['practice', 'laps', 'time'].includes(rs.mode) ? rs.mode : 'time',
      laps: Number(rs.laps) || 10,
      minutes: Number(rs.minutes) || 5
    };
  }

  initRaceSetupUI() {
    const fill = (id, list) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = list.map((x) => `<option value="${x.id}">${x.name}</option>`).join('');
    };
    const setupBody = document.getElementById('setup-sel-body');
    if (setupBody) setupBody.innerHTML = bodyOptionsHtml((b) => b.name);
    fill('setup-sel-chassis', CHASSIS_LIST);
    fill('setup-sel-track', TRACK_LAYOUTS);

    // Cambiando modello o pista si mostra il telaio salvato nel profilo di quella combinazione
    const syncChassisFromProfile = () => {
      const bodyId = document.getElementById('setup-sel-body')?.value;
      const trackId = document.getElementById('setup-sel-track')?.value;
      const prof = this.profileManager.state.autoProfiles[`${bodyId}__${trackId}`];
      const chassisSel = document.getElementById('setup-sel-chassis');
      if (chassisSel) {
        chassisSel.value =
          prof?.carSetup?.chassisId || (trackId === 'arena_drift' ? 'ma030_awd' : CHASSIS_LIST[0]?.id);
      }
    };
    document.getElementById('setup-sel-body')?.addEventListener('change', syncChassisFromProfile);
    document.getElementById('setup-sel-track')?.addEventListener('change', syncChassisFromProfile);

    document.querySelectorAll('.setup-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.setSetupMode(btn.dataset.raceMode));
    });

    document.getElementById('btn-start-race')?.addEventListener('click', () => this.startRaceFromSetup());
    document.getElementById('btn-results-retry')?.addEventListener('click', () => {
      document.getElementById('race-results')?.classList.add('hidden');
      this.beginRace();
    });
    document.getElementById('btn-results-setup')?.addEventListener('click', () => this.showRaceSetup());
  }

  setSetupMode(mode) {
    if (this.demo) mode = DEMO.mode;
    document.querySelectorAll('.setup-mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.raceMode === mode));
    document.getElementById('setup-laps-wrap')?.classList.toggle('hidden', mode !== 'laps');
    document.getElementById('setup-minutes-wrap')?.classList.toggle('hidden', mode !== 'time');
    const desc = document.getElementById('setup-mode-desc');
    if (desc) {
      desc.textContent =
        mode === 'practice'
          ? 'Sessione libera senza fine: giri cronometrati e record della pista.'
          : mode === 'laps'
            ? 'Vince chi completa per primo i giri previsti.'
            : 'Allo scadere del tempo, la gara finisce quando tagli il traguardo (come nei club RC).';
    }
    this.setupSelectedMode = mode;
  }

  showRaceSetup() {
    const st = this.profileManager.state;
    const rs = this.getRaceSettings();
    this.clearCountdown();
    if (this.replay?.isActive) this.stopReplayMode();
    document.getElementById('main-menu-modal')?.classList.add('hidden');
    document.getElementById('race-results')?.classList.add('hidden');

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v);
    };
    setVal('setup-sel-body', st.currentBodyId);
    setVal('setup-sel-track', st.currentTrackId);
    const prof = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
    setVal('setup-sel-chassis', prof.carSetup.chassisId);
    setVal('setup-sel-ai', st.aiLevel || 'club');
    setVal('setup-sel-laps', rs.laps);
    setVal('setup-sel-minutes', rs.minutes);
    const rev = document.getElementById('setup-chk-reverse');
    if (rev) rev.checked = Boolean(st.reverseTrack);
    const comm = document.getElementById('setup-chk-commentary');
    if (comm) comm.checked = st.audio.commentaryEnabled !== false;
    this.setSetupMode(rs.mode);
    this.updateInstallVisibility();

    // Niente auto in pista finché non si preme "Inizia": sala vista dal palco con il tavolo vuoto
    this.racePhase = 'setup';
    this.timerRunning = false;
    if (this.car) {
      if (this.car.onWorkbench) this.car.setWorkbenchMode(false);
      this.car.rootGroup.visible = false;
    }
    if (this.club) {
      this.club.aiPaused = true;
      this.club.aiCarsGroup.visible = false;
    }
    this.sound.setMotorActive(false);
    this.setDriveCameraMode('stand_normal');
    document.body.classList.add('in-race-setup');
    document.getElementById('race-setup-screen')?.classList.remove('hidden');
  }

  async startRaceFromSetup() {
    const startBtn = document.getElementById('btn-start-race');
    if (startBtn?.disabled) return;
    if (startBtn) startBtn.disabled = true;
    try {
      const st = this.profileManager.state;
      const val = (id) => document.getElementById(id)?.value;
      st.currentBodyId = val('setup-sel-body') || st.currentBodyId;
      st.currentTrackId = val('setup-sel-track') || st.currentTrackId;
      st.reverseTrack = Boolean(document.getElementById('setup-chk-reverse')?.checked);
      st.audio.commentaryEnabled = Boolean(document.getElementById('setup-chk-commentary')?.checked);
      st.raceSettings = {
        mode: this.setupSelectedMode || 'time',
        laps: Number(val('setup-sel-laps')) || 10,
        minutes: Number(val('setup-sel-minutes')) || 5
      };
      if (this.demo) applyDemoState(st);
      this.profileManager.save();

      const prof = this.profileManager.updateActiveCarSetup(
        { chassisId: this.demo ? CHASSIS_LIST[0]?.id : val('setup-sel-chassis') },
        this.bodyNamesMap,
        this.trackNamesMap
      );
      this.loadActiveTrack(false);
      await this.car.applySetup(prof.carSetup);

      const aiLevel = val('setup-sel-ai') || 'club';
      st.aiLevel = aiLevel;
      this.profileManager.save();
      this.club.setAiDifficulty(aiLevel);
      document.querySelectorAll('.ai-mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.ai === aiLevel));
      const aiSel = document.getElementById('sel-ai-difficulty');
      if (aiSel) aiSel.value = aiLevel;

      this.refreshMenuUI();
      document.getElementById('race-setup-screen')?.classList.add('hidden');
      document.body.classList.remove('in-race-setup');
      this.beginRace();
    } finally {
      if (startBtn) startBtn.disabled = false;
    }
  }

  clearCountdown() {
    this.countdownTimers.forEach((t) => clearTimeout(t));
    this.countdownTimers = [];
    document.getElementById('race-countdown')?.classList.add('hidden');
  }

  // Griglia di partenza + semaforo: l'auto e gli avversari sono fermi finché non si accende il verde
  beginRace() {
    if (!this.trackData || !this.car) return;
    this.clearCountdown();
    if (this.replay.isActive) this.stopReplayMode();
    document.getElementById('race-results')?.classList.add('hidden');

    this.lapNumber = 0;
    this.lastLapSec = null;
    this.currentLapSec = 0;
    this.timerRunning = false;
    this.raceElapsedSec = 0;
    this.raceTimeExpired = false;
    this.sessionBestLapSec = null;
    this.club.lastBridgeSide = null;
    this.club.lapArmed = false;
    this.club.playerBodyId = this.car.bodyId;
    this.club.spawnAiCars();
    this.club.aiCars.forEach((ai) => {
      ai.speed = 0;
    });
    this.club.aiPaused = true;
    this.club.updateBridgeDisplay(0, null, this.bestLapSec);
    this.updateTimingHUD();
    if (this.car.onWorkbench) this.car.setWorkbenchMode(false);
    this.car.rootGroup.visible = true;
    this.car.resetOnTrack(this.trackData.startX, this.trackData.startZ, this.trackData.startHeading);
    this.replay.clear();
    this.resetStandings();
    this.sound.setMotorActive(true);
    this.racePhase = 'countdown';

    const rs = this.getRaceSettings();
    const trackName = this.trackNamesMap[this.profileManager.state.currentTrackId] || 'pista del club';
    const intro =
      rs.mode === 'practice'
        ? `Prove libere su ${trackName}.`
        : rs.mode === 'laps'
          ? `Gara di ${rs.laps} giri su ${trackName}. Piloti pronti.`
          : `Gara di ${rs.minutes} minuti su ${trackName}. Piloti pronti.`;
    this.sound.speak(intro, 'force');

    const box = document.getElementById('race-countdown');
    const txt = document.getElementById('race-countdown-text');
    const show = (label, go = false) => {
      if (!box || !txt) return;
      txt.textContent = label;
      box.classList.toggle('go', go);
      box.classList.remove('hidden');
    };
    const steps = ['3', '2', '1'];
    const t0 = 1600;
    steps.forEach((label, i) => {
      this.countdownTimers.push(
        setTimeout(() => {
          show(label);
          this.sound.playStartBeep(false);
        }, t0 + i * 1000)
      );
    });
    this.countdownTimers.push(
      setTimeout(() => {
        show('VIA!', true);
        this.sound.playStartBeep(true);
        this.racePhase = 'racing';
        this.raceStartTime = performance.now();
        this.club.aiPaused = false;
        // Chi è in griglia dietro la linea non ha ancora "completato" il giro quando la attraversa
        // In griglia sono tutti dietro la linea: il primo passaggio sotto il ponte non è un giro completato
        this.club.aiCars.forEach((ai) => {
          ai.raceStartLaps = ai.laps + 1;
        });
      }, t0 + steps.length * 1000)
    );
    this.countdownTimers.push(
      setTimeout(() => document.getElementById('race-countdown')?.classList.add('hidden'), t0 + steps.length * 1000 + 900)
    );
  }

  finishRace() {
    this.racePhase = 'finished';
    this.timerRunning = false;
    this.club.aiPaused = true;
    this.sound.speak('Bandiera a scacchi! Gara conclusa.', 'high');

    const fmt = (t) => (t !== null && t !== undefined ? `${t.toFixed(2)}s` : '--.--');
    const playerLaps = Math.max(0, this.lapNumber - 1);
    const rows = [
      { name: 'Tu', laps: playerLaps, best: this.sessionBestLapSec, isPlayer: true },
      ...this.club.aiCars.map((ai) => ({
        name: ai.driver.name,
        laps: Math.max(0, ai.laps - (ai.raceStartLaps ?? ai.laps)),
        best: ai.bestLap,
        isPlayer: false
      }))
    ];
    if (this.club.aiLevel === 'none') rows.length = 1;
    rows.sort((a, b) => b.laps - a.laps || (a.best ?? 999) - (b.best ?? 999));

    const totalMin = Math.floor(this.raceElapsedSec / 60);
    const totalSec = (this.raceElapsedSec % 60).toFixed(2).padStart(5, '0');
    const pos = rows.findIndex((r) => r.isPlayer) + 1;
    const summary = document.getElementById('race-results-summary');
    if (summary) {
      summary.innerHTML =
        `<strong>${playerLaps} giri</strong> in <strong>${totalMin}:${totalSec}</strong> • ` +
        `miglior giro <strong>${fmt(this.sessionBestLapSec)}</strong>` +
        (rows.length > 1 ? ` • posizione <strong>${pos}ª su ${rows.length}</strong>` : '');
    }
    const tbody = document.getElementById('race-results-rows');
    if (tbody) {
      tbody.innerHTML = rows
        .map(
          (r, i) =>
            `<tr class="${r.isPlayer ? 'is-player' : ''}"><td>${i + 1}. ${r.name}</td><td>${r.laps}</td><td>${fmt(r.best)}</td></tr>`
        )
        .join('');
    }
    setTimeout(() => {
      if (this.racePhase === 'finished') document.getElementById('race-results')?.classList.remove('hidden');
    }, 1800);
  }

  updateRaceHUD() {
    const modeEl = document.getElementById('hud-race-mode');
    const progEl = document.getElementById('hud-race-progress');
    if (!modeEl || !progEl) return;
    const rs = this.getRaceSettings();
    const fmtClock = (sec) => {
      const v = Math.max(0, sec);
      return `${Math.floor(v / 60)}:${Math.floor(v % 60).toString().padStart(2, '0')}`;
    };
    const done = Math.max(0, this.lapNumber - 1);
    if (this.racePhase === 'countdown') {
      modeEl.textContent = 'PARTENZA';
      progEl.textContent = '--';
    } else if (rs.mode === 'practice') {
      modeEl.textContent = 'PROVE LIBERE';
      progEl.textContent = fmtClock(this.raceElapsedSec);
    } else if (rs.mode === 'laps') {
      modeEl.textContent = this.racePhase === 'finished' ? 'FINE GARA' : 'GIRI';
      progEl.textContent = `${Math.min(done, rs.laps)}/${rs.laps}`;
    } else {
      const left = rs.minutes * 60 - this.raceElapsedSec;
      modeEl.textContent =
        this.racePhase === 'finished' ? 'FINE GARA' : this.raceTimeExpired ? 'ULTIMO GIRO' : 'TEMPO';
      progEl.textContent = fmtClock(left);
    }
  }

  refreshGamepadDeviceSelect() {
    const sel = document.getElementById('sel-gamepad-device');
    if (!sel) return;
    const devices = this.controller.getConnectedDevices();
    const curVal = this.controller.preferredDevice || 'auto';
    const options = [
      `<option value="auto">🔄 Automatico (Joypad / Radiocomando — Ignora Button Box)</option>`,
      `<option value="keyboard">⌨️ Solo Tastiera (Ignora tutte le periferiche USB)</option>`
    ];
    for (const d of devices) {
      const tag = d.isButtonBox ? ' [Button Box ignorata in Auto]' : '';
      options.push(`<option value="${d.index}">🎮 USB #${d.index + 1}: ${d.id.slice(0, 48)}${tag}</option>`);
    }
    sel.innerHTML = options.join('');
    sel.value = curVal;
  }

  // Volante + pedaliera e radiocomando RC via USB
  initHardwareListeners() {
    const pm = this.profileManager;
    document.getElementById('sel-control-mode')?.addEventListener('change', (e) => {
      const mode = e.target.value;
      pm.updateWheelConfig({ mode });
      // Ogni tipo di comando parte dalle sue curve (volante lineare, radio come una radio di serie, joypad più dolce)
      const preset = CONTROLLER_PRESETS[MODE_PRESET[mode] || 'joypad'];
      pm.updateActiveController({ ...preset }, this.bodyNamesMap, this.trackNamesMap);
      this.controller.selectActivePad();
      this.refreshMenuUI();
    });
    document.getElementById('sel-wheel-rotation')?.addEventListener('change', (e) => {
      const rotation = Number(e.target.value);
      const w = pm.getWheelConfig();
      pm.updateWheelConfig({ rotation, lockDeg: Math.min(w.lockDeg ?? 180, rotation) });
      this.refreshHardwareUI();
    });
    document.getElementById('rng-wheel-lock')?.addEventListener('input', (e) => {
      const w = pm.getWheelConfig();
      const lockDeg = Math.min(Number(e.target.value), w.rotation ?? 900);
      pm.updateWheelConfig({ lockDeg });
      const v = document.getElementById('val-wheel-lock');
      if (v) v.textContent = `${lockDeg}°`;
    });
    document.getElementById('rng-pedal-dz')?.addEventListener('input', (e) => {
      pm.updateWheelConfig({ pedalDeadzone: Number(e.target.value) });
      const v = document.getElementById('val-pedal-dz');
      if (v) v.textContent = `${e.target.value}%`;
    });

    const waitText = {
      wheelSteer: 'Gira ora il volante...',
      pedalThrottle: 'Premi il gas a fondo e rilascia...',
      pedalBrake: 'Premi il freno a fondo e rilascia...',
      rcSteer: 'Destra a fondo, sinistra a fondo, lascia...',
      rcThrottle: 'Tira a fondo, spingi a fondo, lascia...'
    };
    const configKey = { wheelSteer: 'steer', pedalThrottle: 'pedalThrottle', pedalBrake: 'pedalBrake', rcSteer: 'rcSteer', rcThrottle: 'rcThrottle' };
    document.querySelectorAll('.hw-cal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.cal;
        document.querySelectorAll('.hw-cal-btn').forEach((b) => b.classList.remove('listening'));
        btn.classList.add('listening');
        btn.textContent = waitText[kind];
        this.controller.startWheelCalibration(kind, (doneKind, result) => {
          btn.classList.remove('listening');
          if (result) {
            pm.updateWheelConfig({ [configKey[doneKind]]: result });
            this.controller.selectActivePad();
          } else {
            this.sound.speak('Calibrazione non riuscita, riprova portando il comando fino a fine corsa.', 'normal');
          }
          this.refreshHardwareUI();
        });
      });
    });
  }

  refreshHardwareUI() {
    const w = this.profileManager.getWheelConfig();
    const mode = w.mode ?? 'pad';
    const modeSel = document.getElementById('sel-control-mode');
    if (modeSel) modeSel.value = mode;
    document.getElementById('hw-wheel-fields')?.classList.toggle('visible', mode === 'wheel');
    document.getElementById('hw-rc-fields')?.classList.toggle('visible', mode === 'rc');

    const rotSel = document.getElementById('sel-wheel-rotation');
    if (rotSel) rotSel.value = String(w.rotation ?? 900);
    const lock = document.getElementById('rng-wheel-lock');
    if (lock) {
      lock.max = String(w.rotation ?? 900);
      lock.value = String(w.lockDeg ?? 180);
    }
    const lockVal = document.getElementById('val-wheel-lock');
    if (lockVal) lockVal.textContent = `${w.lockDeg ?? 180}°`;
    const dz = document.getElementById('rng-pedal-dz');
    if (dz) dz.value = String(w.pedalDeadzone ?? 3);
    const dzVal = document.getElementById('val-pedal-dz');
    if (dzVal) dzVal.textContent = `${w.pedalDeadzone ?? 3}%`;

    const connected = this.controller.getConnectedDevices();
    const isConnected = (cal) => cal && connected.some((d) => d.id === cal.device);
    const describe = (cal) => {
      if (!cal) return 'non calibrato';
      const name = cal.device.replace(/\s*\(.*$/, '').slice(0, 32);
      return `${name} • asse ${cal.axis}${isConnected(cal) ? '' : ' (non collegato)'}`;
    };
    const setTxt = (id, t) => {
      const e = document.getElementById(id);
      if (e) e.textContent = t;
    };
    setTxt('lbl-wheel-steer', describe(w.steer));
    setTxt('lbl-pedal-throttle', describe(w.pedalThrottle));
    setTxt('lbl-pedal-brake', describe(w.pedalBrake));
    setTxt('lbl-rc-steer', describe(w.rcSteer));
    setTxt('lbl-rc-throttle', describe(w.rcThrottle));

    const btnText = {
      wheelSteer: 'Calibra: gira il volante',
      pedalThrottle: 'Calibra: premi a fondo e rilascia',
      pedalBrake: 'Calibra: premi a fondo e rilascia',
      rcSteer: 'Calibra',
      rcThrottle: 'Calibra'
    };
    document.querySelectorAll('.hw-cal-btn:not(.listening)').forEach((b) => {
      b.textContent = btnText[b.dataset.cal];
    });

    const wheels = connected.filter((d) => d.isWheel);
    let note = '';
    const radios = connected.filter((d) => d.isRcRadio);
    if (mode === 'pad' && radios.length) note = `📻 Rilevato: ${radios[0].id.slice(0, 48)}. Scegli "Radiocomando RC collegato via USB" per usarlo.`;
    else if (mode === 'pad' && wheels.length) note = `🏁 Rilevato: ${wheels[0].id.slice(0, 48)}. Scegli "Volante + Pedaliera" per usarlo.`;
    else if (mode === 'wheel' && !w.steer) note = 'Calibra lo sterzo e i due pedali: vale per tutte le auto e le piste.';
    else if (mode === 'rc' && !(w.rcSteer && w.rcThrottle)) note = 'Calibra volantino e grilletto: vale per tutte le auto e le piste.';
    setTxt('hw-detected', note);
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

    const b2 = document.getElementById('btn-Toggle-naked-chassis');
    if (b2) {
      b2.textContent = nextVal
        ? '🏎️ Rimonta Carrozzeria sopra il Telaio MR-04'
        : '🔍 Smonta Carrozzeria sul Banco (Vedi Telaio MR-04)';
    }

    if (nextVal) {
      this.sound.speak(
        'Carrozzeria smontata e appoggiata sul tappetino del banco! Ora vedi il telaio Kyosho MR-04 con le quattro batterie ministilo, la scheda elettronica, le molle anteriori e il motore.',
        'normal'
      );
    }
  }

  populateBodySelect() {
    const selBody = document.getElementById('sel-body');
    if (!selBody) return;
    selBody.innerHTML = bodyOptionsHtml((b) => `${b.name} (${b.scaleLabel})`);
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
      { id: 'rng-steer-speed', valId: 'val-steer-speed', key: 'steerSpeedLimit', suffix: '%' },
      { id: 'rng-servo-speed', valId: 'val-servo-speed', key: 'servoSpeed', suffix: '%' },
      { id: 'rng-thr-exp', valId: 'val-thr-exp', key: 'throttleExp', suffix: '%' },
      { id: 'rng-brake-exp', valId: 'val-brake-exp', key: 'brakeExp', suffix: '%' },
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

    for (const [btnId, preset] of [['btn-preset-joypad', 'joypad'], ['btn-preset-radio', 'radio']]) {
      document.getElementById(btnId)?.addEventListener('click', () => {
        this.profileManager.updateActiveController({ ...CONTROLLER_PRESETS[preset] }, this.bodyNamesMap, this.trackNamesMap);
        this.refreshMenuUI();
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

    this.initHardwareListeners();

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
    this.refreshDisplaySettingsUI?.();
    this.applyStandingsVisibility();
    const activeProf = this.profileManager.getActiveProfile(this.bodyNamesMap, this.trackNamesMap);
    const setup = activeProf.carSetup;
    const ctrl = activeProf.controller;

    const bodyName = this.bodyNamesMap[state.currentBodyId] || state.currentBodyId;
    const trackName = this.trackNamesMap[state.currentTrackId] || state.currentTrackId;
    const profileLabel = `${bodyName} • ${trackName}`;

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

    // Scheda 5: i controlli audio mostrano i valori salvati (prima restavano sui valori fissi dell'HTML)
    const chkComm = document.getElementById('chk-commentary-enabled');
    if (chkComm) chkComm.checked = state.audio.commentaryEnabled !== false;
    const setAudioSlider = (id, valId, v) => {
      const pct = Math.round((v ?? 0) * 100);
      const el = document.getElementById(id);
      if (el) el.value = pct;
      const vEl = document.getElementById(valId);
      if (vEl) vEl.textContent = `${pct}%`;
    };
    setAudioSlider('rng-vol-comm', 'val-vol-comm', state.audio.commentaryVolume ?? 0.95);
    setAudioSlider('rng-vol-motor', 'val-vol-motor', state.audio.motorVolume ?? 0.65);

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
    setSlider('rng-steer-speed', 'val-steer-speed', ctrl.steerSpeedLimit ?? 0, '%');
    setSlider('rng-servo-speed', 'val-servo-speed', ctrl.servoSpeed, '%');
    setSlider('rng-thr-exp', 'val-thr-exp', ctrl.throttleExp, '%');
    setSlider('rng-brake-exp', 'val-brake-exp', ctrl.brakeExp ?? 0, '%');
    setSlider('rng-brake-epa', 'val-brake-epa', ctrl.brakeStrength, '%');
    setSlider('rng-deadzone', 'val-deadzone', ctrl.deadzone, '%');
    setSlider('rng-steer-trim', 'val-steer-trim', ctrl.steeringTrim, '');

    const invS = document.getElementById('chk-inv-steer');
    if (invS) invS.checked = Boolean(ctrl.invertSteering);
    const invT = document.getElementById('chk-inv-thr');
    if (invT) invT.checked = Boolean(ctrl.invertThrottle);

    this.refreshGamepadDeviceSelect();
    this.refreshHardwareUI();

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

  // Classifica di gara in tempo reale (in alto a sinistra), attivabile e disattivabile: Menu → scheda 5,
  // pulsante ✕ / "🏁 Classifica" sull'HUD, oppure tasto L. La scelta resta salvata nel profilo.
  initStandingsUI() {
    this.standings = new RaceStandings(document.getElementById('standings-list'));
    const apply = (show) => {
      this.profileManager.state.display.showStandings = show;
      this.profileManager.save();
      this.applyStandingsVisibility();
    };
    document.getElementById('btn-standings-hide')?.addEventListener('click', () => apply(false));
    document.getElementById('btn-standings-show')?.addEventListener('click', () => apply(true));
    document.getElementById('chk-show-standings')?.addEventListener('change', (e) => apply(e.target.checked));
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyL' || e.repeat || this.racePhase === 'setup' || this.controller?.listeningForBinding) return;
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      apply(this.profileManager.state.display.showStandings === false);
    });
    this.applyStandingsVisibility();
  }

  applyStandingsVisibility() {
    const show = this.profileManager.state.display.showStandings !== false;
    document.body.classList.toggle('standings-hidden', !show);
    const chk = document.getElementById('chk-show-standings');
    if (chk) chk.checked = show;
  }

  resetStandings() {
    const player = DRIVERS[0];
    const body = this.bodyNamesMap[this.profileManager.state.currentBodyId] || '';
    const playerT = this.club.trackT(this.car.state.x, this.car.state.z);
    this.standingsPlayerT = playerT;
    this.standings.reset(
      [
        { id: 'player', name: 'Tu', num: player.num, color: player.base, body, isPlayer: true, t: playerT },
        ...this.club.aiCars.map((ai) => ({
          id: ai.id,
          name: ai.driver.name,
          num: ai.driver.num,
          color: ai.driver.base,
          body: ai.bodyName || '',
          t: ai.t
        }))
      ],
      this.club.lapLineT
    );
  }

  updateStandings(dt, now) {
    if (!this.standings || this.standings.cars.size === 0) return;
    const st = this.car.state;
    if (!this.car.onWorkbench) this.standingsPlayerT = this.club.trackT(st.x, st.z, this.standingsPlayerT);
    const noAi = this.club.aiLevel === 'none';
    this.standings.update(dt, now / 1000, [
      { id: 'player', t: this.standingsPlayerT, laps: this.lapNumber - 1 },
      ...this.club.aiCars.map((ai) => ({ id: ai.id, t: ai.t, laps: ai.laps - (ai.raceStartLaps ?? ai.laps + 1), hidden: noAi }))
    ]);
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

    if (this.driveCameraMode === 'pit_bench' || this.driveCameraMode === 'workbench') {
      // Visuale libera Orbit nella sala o sul Banco Lavoro illuminato
      if (this.orbit) {
        this.camera.fov = this.driveCameraMode === 'workbench' ? 38 : 50;
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

    // VISUALE PALCO PILOTI (occhi a y = ROST.top + 1.64 = +1.24m sopra il tavolo, z = ROST.z0 + 0.36 = 1.91m).
    // Il campo visivo viene dallo schermo di chi gioca (misura, formato, distanza) oppure è il classico 50°
    this.camera.position.set(2.45, ROST.top + 1.64, ROST.z0 + 0.36);
    this.camera.fov = this.getStandFov();
    this.camera.updateProjectionMatrix();

    // Con un campo visivo stretto (schermo piccolo o lontano) il pilota gira di più la testa verso l'auto
    const follow = clamp(0.35 + ((50 - this.camera.fov) / 25) * 0.45, 0.35, 0.85);
    const look = new THREE.Vector3(2.45, 0, -1.8).lerp(carPos, follow);
    keepDriverCarVisible(this.camera, look, carPos);
  }

  // Campo visivo verticale (gradi) della vista dal palco.
  // Prospettiva reale: l'angolo è quello sotteso dalla finestra del gioco vista dagli occhi del pilota,
  // vFOV = 2·atan(altezza visibile / 2 / distanza). Altezza schermo = diagonale / √(1 + formato²).
  getStandFov() {
    const d = this.profileManager.state.display || {};
    const zoom = clamp(Number(d.zoom) || 1, 0.5, 2);
    let base = 50;
    if (d.realPerspective !== false) {
      const sw = window.screen?.width || window.innerWidth;
      const sh = window.screen?.height || window.innerHeight;
      let ratio = sw / sh;
      if (d.aspect && d.aspect !== 'auto') {
        const [w, h] = d.aspect.split(':').map(Number);
        if (w > 0 && h > 0) ratio = w / h;
      }
      const diagCm = (Number(d.diagonalInch) || 27) * 2.54;
      const screenHcm = diagCm / Math.sqrt(1 + ratio * ratio);
      // Se la finestra non è a schermo intero il gioco occupa solo una parte dell'altezza dello schermo
      const windowShare = clamp(window.innerHeight / sh, 0.25, 1);
      const distCm = clamp(Number(d.distanceCm) || 65, 20, 400);
      base = (2 * Math.atan((screenHcm * windowShare) / 2 / distCm) * 180) / Math.PI;
    }
    const fov = (2 * Math.atan(Math.tan((base * Math.PI) / 360) * zoom) * 180) / Math.PI;
    return clamp(fov, 10, 100);
  }

  initDisplaySettingsUI() {
    let d = this.profileManager.state.display;
    const chk = document.getElementById('chk-real-perspective');
    const diag = document.getElementById('sel-screen-diagonal');
    const aspect = document.getElementById('sel-screen-aspect');
    const dist = document.getElementById('rng-screen-distance');
    const zoom = document.getElementById('rng-fov-zoom');

    const refresh = () => {
      // Dopo il ripristino di un backup lo stato è un oggetto nuovo
      d = this.profileManager.state.display;
      if (chk) chk.checked = d.realPerspective !== false;
      if (diag) {
        // Una misura salvata che non è in elenco viene aggiunta come voce
        const v = String(d.diagonalInch);
        if (![...diag.options].some((o) => o.value === v)) diag.add(new Option(`${v}"`, v));
        diag.value = v;
      }
      if (aspect) aspect.value = d.aspect || 'auto';
      if (dist) dist.value = d.distanceCm;
      if (zoom) zoom.value = Math.round((d.zoom || 1) * 100);
      const distLbl = document.getElementById('val-screen-distance');
      if (distLbl) distLbl.textContent = `${d.distanceCm} cm`;
      const zoomLbl = document.getElementById('val-fov-zoom');
      if (zoomLbl) zoomLbl.textContent = `${Math.round((d.zoom || 1) * 100)}%`;
      for (const el of [diag, aspect, dist]) if (el) el.disabled = d.realPerspective === false;
      const out = document.getElementById('display-fov-readout');
      if (out) {
        const sw = window.screen?.width || 0;
        const sh = window.screen?.height || 0;
        const detected = sw && sh ? ` • schermo rilevato ${sw}×${sh}` : '';
        out.textContent =
          d.realPerspective === false
            ? `Campo visivo classico: ${this.getStandFov().toFixed(0)}°`
            : `Campo visivo verticale dal palco: ${this.getStandFov().toFixed(1)}°${detected}`;
      }
    };
    const save = () => {
      this.profileManager.save();
      refresh();
    };

    chk?.addEventListener('change', (e) => {
      d.realPerspective = e.target.checked;
      save();
    });
    diag?.addEventListener('change', (e) => {
      d.diagonalInch = Number(e.target.value);
      save();
    });
    aspect?.addEventListener('change', (e) => {
      d.aspect = e.target.value;
      save();
    });
    dist?.addEventListener('input', (e) => {
      d.distanceCm = Number(e.target.value);
      save();
    });
    zoom?.addEventListener('input', (e) => {
      d.zoom = Number(e.target.value) / 100;
      save();
    });
    window.addEventListener('resize', refresh);
    this.refreshDisplaySettingsUI = refresh;
    refresh();
  }

  initVoiceSettingsUI() {
    const sel = document.getElementById('sel-commentary-voice');
    const hint = document.getElementById('voice-hint');
    const audio = this.profileManager.state.audio;

    // Nella scelta ci sono Alice (e le altre voci femminili) e la voce maschile di Slot Car
    const fill = (voices, active, slotCarVoice) => {
      if (!sel) return;
      sel.innerHTML = '';
      for (const v of voices) {
        const tag = /natural|neural|online|premium|enhanced|migliorat/i.test(v.name) ? ' ★ naturale' : '';
        sel.add(new Option(`${v.name} (${v.lang})${tag}`, v.name));
      }
      if (slotCarVoice) sel.add(new Option(`Voce di Slot Car · ${slotCarVoice.name}`, SoundAndCommentary.SLOT_CAR_VOICE));
      sel.value = this.sound.useSlotCarVoice ? SoundAndCommentary.SLOT_CAR_VOICE : active?.name || '';
      if (hint) {
        hint.textContent = !('speechSynthesis' in window)
          ? 'Questo browser non ha la sintesi vocale: restano i sottotitoli.'
          : !active
            ? 'Nessuna voce italiana installata: aggiungila dalle impostazioni di sistema (Lingua → Italiano → Voce) oppure usa Edge o Chrome.'
            : `In uso: ${active.name}.`;
      }
    };
    this.sound.onVoicesChanged = fill;
    fill(this.sound.availableVoices, this.sound.italianVoice, this.sound.slotCarVoice);

    sel?.addEventListener('change', (e) => {
      this.sound.setVoiceByName(e.target.value);
      this.sound.speak('Ecco la nuova voce della direzione gara.', 'force');
    });

    const bindSlider = (id, valId, key) => {
      const el = document.getElementById(id);
      const lbl = document.getElementById(valId);
      const pct = Math.round((audio[key] ?? 1) * 100);
      if (el) el.value = pct;
      if (lbl) lbl.textContent = `${pct}%`;
      el?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        if (lbl) lbl.textContent = `${v}%`;
        audio[key] = v / 100;
        this.profileManager.save();
      });
    };
    bindSlider('rng-voice-rate', 'val-voice-rate', 'voiceRate');
    bindSlider('rng-voice-pitch', 'val-voice-pitch', 'voicePitch');

    document.getElementById('btn-test-voice')?.addEventListener('click', () => {
      this.sound.speak('Giro tre, sei e quarantadue. Nuovo miglior tempo della Ferrari sotto il palco!', 'force');
    });
  }

  // L'ombra nitida segue l'auto: il frustum resta centrato sotto la Mini-Z ovunque sia (pista, replay)
  updateCarShadowLight() {
    if (!this.carShadowLight || !this.car) return;
    const p = this.car.rootGroup.position;
    this.carShadowLight.target.position.copy(p);
    this.carShadowLight.position.copy(p).add(this.carShadowLightOffset);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    // Risoluzione adattiva in qualità Alta: se in gara si scende sotto 28 FPS, si riduce un poco la risoluzione
    this.qualityComposer.monitor(now, this.racePhase === 'racing');

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

    // 2. Lettura Joypad / Radiocomando / Tastiera (in griglia, al semaforo e dopo la bandiera l'auto non risponde)
    const rawInput = this.controller.update(dt);
    const input =
      this.racePhase === 'racing' ? rawInput : { ...rawInput, steer: 0, throttle: 0, brake: 0 };

    // Aggiorna barre di test e indicatori controller
    const steerPct = clamp(50 + rawInput.steer * 45, 2, 98);
    const thrPct = clamp(Math.max(rawInput.throttle, rawInput.brake) * 100, 0, 100);
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

    // Schermata impostazioni gara: la sala vive (persone animate) ma sul tavolo non c'è nessuna auto
    if (this.racePhase === 'setup') {
      this.updateDriverCamera(dt);
      this.club.animateCharacters(now * 0.001, this.car.rootGroup.position, this.sound.isSpeaking, dt, this.camera.position, 0);
      this.qualityComposer.render();
      return;
    }

    if (this.racePhase === 'racing') {
      this.raceElapsedSec = (now - this.raceStartTime) / 1000;
      const rs = this.getRaceSettings();
      if (rs.mode === 'time' && !this.raceTimeExpired && this.raceElapsedSec >= rs.minutes * 60) {
        this.raceTimeExpired = true;
        this.sound.speak('Tempo scaduto! Ultimo giro, la gara finisce sul traguardo.', 'high');
      }
    }
    this.updateRaceHUD();

    // 3. Se siamo in modalità Replay Multicamera, riproduce il Replay
    if (this.replay.isActive) {
      this.sound.setMotorActive(false);
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
      this.updateCarShadowLight();
      this.qualityComposer.render();
      return;
    }

    // 4. Avanzamento Fisica Mini-Z (2 sotto-passi per massima precisione, sospeso mentre l'auto è sul Banco Lavoro!)
    const subSteps = 2;
    const subDt = dt / subSteps;
    if (!this.car.onWorkbench) {
      for (let s = 0; s < subSteps; s++) {
        this.car.updatePhysics(
          subDt,
          input,
          this.trackData,
          (hitSpeed) => {
            if (hitSpeed > 0.7) {
              this.sound.playBarrierHit(hitSpeed * 0.35, this.car.rootGroup.position);
              if (hitSpeed > 1.85) this.sound.commentWallHit(true);
            }
          },
          () => {
            this.sound.commentFlipMarshal();
          }
        );

        // Controllo passaggio sotto il Ponte di Cronometraggio IC-Tag
        const crossEvent =
          this.racePhase === 'racing' ? this.trackData.checkLapCrossing(this.car.state.x, this.car.state.z) : null;
        if (crossEvent === 'timer_started') {
          this.timerRunning = true;
          this.lapStartTime = now;
          this.lapNumber = 1;
          this.sound.playLapBeep(false);
          this.sound.speak('Primo giro lanciato!', 'normal');
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
            if (this.sessionBestLapSec === null || lapSec < this.sessionBestLapSec) this.sessionBestLapSec = lapSec;

            const delta = prevBest ? lapSec - prevBest : null;
            this.sound.playLapBeep(isRecord);
            this.sound.commentLap(this.lapNumber, lapSec, isRecord, delta);

            this.lapNumber++;
            this.lapStartTime = now;
            this.club.updateBridgeDisplay(this.lapNumber, this.lastLapSec, this.bestLapSec);

            const rs = this.getRaceSettings();
            const lapsDone = this.lapNumber - 1;
            if ((rs.mode === 'laps' && lapsDone >= rs.laps) || (rs.mode === 'time' && this.raceTimeExpired)) {
              this.finishRace();
              break;
            }
          }
        }
      }
    } else {
      this.car.syncVisuals();
    }

    if (this.timerRunning) {
      this.currentLapSec = (now - this.lapStartTime) / 1000;
    }
    this.updateTimingHUD();
    this.updateStandings(dt, now);

    // Commenti dinamici in gara (Traversi Drift o Velocità massima sul rettilineo sotto il palco)
    if (this.racePhase !== 'racing') {
      // niente commenti di colore fuori gara
    } else if (this.car.state.slipAmount > 0.58 && Math.abs(this.car.state.speed) > 1.8 && Math.random() < dt * 0.45) {
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
    // Il tono segue i giri del motore, non la velocità: con un pignone più grande, a parità di velocità il
    // motore gira più piano (prima il 9T a fondo rettilineo fischiava più alto del 7T)
    const pinion = PINIONS.find((p) => p.id === activeSetup.pinionId);
    const speedRatio = Math.abs(this.car.state.speed) / (motorSpec.maxSpeedMs * (pinion?.speedMult || 1));
    if (!this.replay.isActive) this.sound.setMotorActive(this.racePhase !== 'finished' || Math.abs(this.car.state.speed) > 0.05);
    this.sound.updateMotorSound(speedRatio, input.throttle, this.car.state.slipAmount, motorSpec, this.car.rootGroup.position);

    const realKmh = Math.abs(this.car.state.speed) * 3.6;
    const scaleKmh = Math.round(realKmh * 27);
    const realEl = document.getElementById('hud-speed-real');
    const scaleEl = document.getElementById('hud-speed-scale');
    if (realEl) realEl.textContent = realKmh.toFixed(1);
    if (scaleEl) scaleEl.textContent = `${scaleKmh}`;

    // Aggiorna indicatori Batteria 4xAAA Ni-MH (percentuale e tensione sotto carico) e Gomme (usura e temperatura °C)
    const battPct = Math.round(this.car.state.batteryPct ?? 100);
    const battV = (this.car.state.batteryVoltage ?? 5.58).toFixed(2);
    const tirePct = Math.round(this.car.state.tireWearPct ?? 100);
    const tireTemp = Math.round(this.car.state.tireTempC ?? 23);

    const battTxtEl = document.getElementById('hud-batt-text');
    const battBarEl = document.getElementById('hud-batt-bar');
    const tireTxtEl = document.getElementById('hud-tire-text');
    const tireBarEl = document.getElementById('hud-tire-bar');

    if (battTxtEl) battTxtEl.textContent = `${battPct}% • ${battV}V`;
    if (battBarEl) battBarEl.style.width = `${battPct}%`;
    if (tireTxtEl) tireTxtEl.textContent = `${tirePct}% • ${tireTemp}°C`;
    if (tireBarEl) tireBarEl.style.width = `${tirePct}%`;

    // 6. Registra frame per il Replay Multicamera
    if (this.racePhase === 'racing') this.replay.recordFrame(this.car.state, this.currentLapSec);

    // 7. Aggiorna Visuale dal Palco e Personaggi animati nella sala (e gli avversari, che vedono l'auto del giocatore)
    const playerOnTrack = this.car.rootGroup.visible && !this.car.onWorkbench;
    const st = this.car.state;
    this.club.playerBody = { active: playerOnTrack, x: st.x, z: st.z, vx: st.vx, vz: st.vz };
    this.updateDriverCamera(dt);
    this.club.animateCharacters(
      now * 0.001,
      this.car.rootGroup.position,
      this.sound.isSpeaking,
      dt,
      this.camera.position,
      input.throttle
    );

    // 8. Contatti veri tra le auto: si spingono, rimbalzano e si sentono (nessuna auto "fantasma")
    const contacts = this.club.resolveCarContacts({ active: playerOnTrack, state: st });
    if (contacts.length) {
      if (playerOnTrack) this.car.syncVisuals();
      for (const c of contacts) {
        if (c.speed < 0.08) continue;
        this.sound.playCarContact(c.speed / 2.2, { x: c.x, y: st.y + 0.03, z: c.z }, `${c.a}-${c.b}`);
      }
    }
    this.sound.updateOpponentEngines(this.club.getOpponentEngineStates());
    this.sound.updateListener(this.camera);

    this.updateCarShadowLight();
    this.qualityComposer.render();
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Il gioco parte solo dopo la verifica dell'accesso (codice personale o demo), come in Slot Car
window.addEventListener('DOMContentLoaded', () => {
  startWithAccess(({ demo }) => new MiniZSimulatorApp({ demo }));
});

// Carrozzerie raggruppate per categoria (Hypercar, GT3); le carrozzerie caricate dal PC restano in cima
function bodyOptionsHtml(labelFn) {
  const option = (b) => `<option value="${b.id}">${labelFn(b)}</option>`;
  const custom = CAR_BODIES.filter((b) => !b.category).map(option).join('');
  const groups = CAR_CATEGORIES.map((cat) => {
    const bodies = CAR_BODIES.filter((b) => b.category === cat.id);
    return bodies.length ? `<optgroup label="${cat.name}">${bodies.map(option).join('')}</optgroup>` : '';
  }).join('');
  return custom + groups;
}
