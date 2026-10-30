import { DEFAULT_CAR_SETUP, CAR_BODIES } from '../data/parts.js';
import { APP_VERSION } from '../version.js';

const STORAGE_KEY = 'miniz_club_sim_state_v1';

export const DEFAULT_CONTROLLER_PROFILE = {
  // Parametri stile radiocomando professionale (Kyosho / Futaba / FlySky Noble)
  // Dalla v1.6.3 i valori sono applicati esattamente come impostati (niente esponenziale o dual rate nascosti).
  // I default sono quelli del preset "Joypad": uno stick ha poca corsa e serve più risoluzione al centro.
  curveVersion: 3,
  steeringExp: -45,       // -100 a +100 (negativo = più dolce al centro, 0 = lineare)
  steerSpeedLimit: 65,    // 0% a 100% (sterzo progressivo: curva più dolce al centro in velocità, 0 = come una radio)
  throttleExp: 0,         // -100 a +100 (0 = lineare come una radio di serie)
  brakeExp: 0,            // -100 a +100
  steeringDualRate: 100,  // 40% a 100% (100% = angolo massimo delle ruote)
  brakeStrength: 100,     // 25% a 100% (EPA freno: forza alla massima corsa del grilletto)
  servoSpeed: 85,         // 35% a 150% (velocità del servo, uguale in andata e al ritorno)
  deadzone: 5,            // 0% a 28% (unica zona morta della levetta)
  steeringTrim: 0,        // -20 a +20 (centratura sterzo)
  throttleTrim: 0,        // -15 a +15
  invertSteering: false,
  invertThrottle: false,
  // Mappatura Joypad (indici assi / bottoni standard Gamepad API)
  Bindings: {
    padSteerAxis: 0,        // Levetta sinistra X (o volantino RC USB)
    padThrottleAxis: -1,    // Se >= 0 usa un asse per gas
    padThrottleBtn: 7,      // R2 / Grilletto destro
    padBrakeBtn: 6,         // L2 / Grilletto sinistro
    padMarshalBtn: 3,       // Y / Triangolo (Chiama Commissario)
    padCameraBtn: 1,        // B / Cerchio (Cambia Visuale)
    padReplayBtn: 2,        // X / Quadrato (Apri Replay)
    keyLeft: 'ArrowLeft',
    keyRight: 'ArrowRight',
    keyThrottle: 'ArrowUp',
    keyBrake: 'ArrowDown',
    keyMarshal: 'KeyR',
    keyCamera: 'KeyC'
  }
};

// Preset dello sterzo: "Joypad" per uno stick con poca corsa, "Radiocomando" come una radio a pistola di serie
export const CONTROLLER_PRESETS = {
  joypad: { steeringExp: -45, steeringDualRate: 100, steerSpeedLimit: 65, servoSpeed: 85, deadzone: 5 },
  radio: { steeringExp: -10, steeringDualRate: 100, steerSpeedLimit: 0, servoSpeed: 100, deadzone: 2 }
};

// Fino alla v1.6.1 sterzo, gas e freno avevano esponenziale e dual rate nascosti sopra i valori del menu,
// e la v1.6.3 non aveva ancora il preset Joypad: i vecchi valori tornano ai nuovi default
// (mappatura, trim e inversioni restano quelli dell'utente)
function migrateControllerProfile(controller) {
  const version = controller.curveVersion ?? 1;
  if (version >= DEFAULT_CONTROLLER_PROFILE.curveVersion) return controller;
  const d = DEFAULT_CONTROLLER_PROFILE;
  if (version === 2) {
    // Dalla v1.6.3: si aggiorna solo lo sterzo, gas e freno restano come li ha regolati l'utente
    return { ...controller, curveVersion: d.curveVersion, ...CONTROLLER_PRESETS.joypad };
  }
  return {
    ...controller,
    curveVersion: d.curveVersion,
    steerSpeedLimit: d.steerSpeedLimit,
    steeringExp: d.steeringExp,
    throttleExp: d.throttleExp,
    brakeExp: d.brakeExp,
    steeringDualRate: d.steeringDualRate,
    brakeStrength: d.brakeStrength,
    servoSpeed: d.servoSpeed,
    deadzone: d.deadzone
  };
}

export class ProfileManager {
  constructor() {
    this.state = this.loadFromStorage();
  }

  getDefaultState() {
    return {
      appVersion: APP_VERSION,
      currentTrackId: 'club_veloce',
      reverseTrack: false,
      currentBodyId: 'ferrari_499p',
      graphicsQuality: 'high', // 'low' | 'medium' | 'high'
      aiLevel: 'club', // 'none' | 'beginner' | 'club' | 'expert' | 'pro'
      audio: {
        commentaryEnabled: true,
        commentaryVolume: 0.95,
        motorVolume: 0.65,
        beepVolume: 0.85,
        voiceName: '', // vuoto = la migliore voce italiana trovata in automatico
        voiceRate: 1.0,
        voicePitch: 1.0
      },
      // Schermo di chi gioca: con la prospettiva reale il campo visivo della vista dal palco è quello
      // che lo schermo occupa davvero davanti agli occhi (misura, formato e distanza)
      display: {
        realPerspective: true,
        diagonalInch: 27,
        aspect: 'auto', // 'auto' | '16:9' | '16:10' | '21:9' | '32:9' | '4:3' | '3:2'
        distanceCm: 65,
        zoom: 1.0, // >1 allarga il campo visivo (vedi più pista), <1 lo stringe
        showStandings: true // classifica di gara in tempo reale in alto a sinistra
      },
      // Profili automatici indicizzati per chiave `${bodyId}__${trackId}`
      autoProfiles: {
        'ferrari_499p__club_veloce': {
          label: 'Ferrari 499P • Circuito Club Veloce',
          bodyId: 'ferrari_499p',
          trackId: 'club_veloce',
          updatedAt: new Date().toISOString(),
          carSetup: { ...DEFAULT_CAR_SETUP, bodyId: 'ferrari_499p' },
          controller: JSON.parse(JSON.stringify(DEFAULT_CONTROLLER_PROFILE))
        },
        'ferrari_499p__arena_drift': {
          label: 'Ferrari 499P • Arena Drift (Assetto 4x4 Drift)',
          bodyId: 'ferrari_499p',
          trackId: 'arena_drift',
          updatedAt: new Date().toISOString(),
          carSetup: {
            ...DEFAULT_CAR_SETUP,
            bodyId: 'ferrari_499p',
            chassisId: 'ma030_awd',
            frontTireId: 'front_drift_lf',
            rearTireId: 'rear_drift_lf',
            diffId: 'diff_spool'
          },
          controller: {
            ...JSON.parse(JSON.stringify(DEFAULT_CONTROLLER_PROFILE)),
            servoSpeed: 120
          }
        }
      },
      // Record migliori giri per pista
      lapRecords: {
        club_veloce: null,
        tecnico_misto: null,
        miniz_cup_gp: null,
        arena_drift: null
      }
    };
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.getDefaultState();
      const parsed = JSON.parse(raw);
      const def = this.getDefaultState();
      const merged = {
        ...def,
        ...parsed,
        currentBodyId: CAR_BODIES.some((b) => b.id === parsed.currentBodyId) ? parsed.currentBodyId : 'ferrari_499p',
        appVersion: APP_VERSION,
        audio: { ...def.audio, ...(parsed.audio || {}) },
        display: { ...def.display, ...(parsed.display || {}) },
        autoProfiles: { ...def.autoProfiles, ...(parsed.autoProfiles || {}) },
        lapRecords: { ...def.lapRecords, ...(parsed.lapRecords || {}) }
      };
      for (const profile of Object.values(merged.autoProfiles)) {
        if (profile?.controller) profile.controller = migrateControllerProfile(profile.controller);
      }
      return merged;
    } catch (e) {
      return this.getDefaultState();
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Impossibile salvare nello storage locale:', e);
    }
  }

  getProfileKey(bodyId = this.state.currentBodyId, trackId = this.state.currentTrackId) {
    return `${bodyId}__${trackId}`;
  }

  getActiveProfile(bodyNamesMap = {}, trackNamesMap = {}) {
    const bodyId = this.state.currentBodyId;
    const trackId = this.state.currentTrackId;
    const key = this.getProfileKey(bodyId, trackId);

    if (!this.state.autoProfiles[key]) {
      // Se non esiste ancora per questa combinazione Auto+Pista, clona dall'ultimo profilo usato o default
      const defaultSetup = { ...DEFAULT_CAR_SETUP, bodyId };
      if (trackId === 'arena_drift') {
        defaultSetup.chassisId = 'ma030_awd';
        defaultSetup.frontTireId = 'front_drift_lf';
        defaultSetup.rearTireId = 'rear_drift_lf';
        defaultSetup.diffId = 'diff_spool';
      }
      this.state.autoProfiles[key] = {
        label: `${bodyNamesMap[bodyId] || bodyId} • ${trackNamesMap[trackId] || trackId}`,
        bodyId,
        trackId,
        updatedAt: new Date().toISOString(),
        carSetup: defaultSetup,
        controller: JSON.parse(JSON.stringify(DEFAULT_CONTROLLER_PROFILE))
      };
      this.save();
    }
    return this.state.autoProfiles[key];
  }

  updateActiveCarSetup(partialSetup, bodyNamesMap = {}, trackNamesMap = {}) {
    const profile = this.getActiveProfile(bodyNamesMap, trackNamesMap);
    profile.carSetup = { ...profile.carSetup, ...partialSetup };
    profile.updatedAt = new Date().toISOString();
    if (partialSetup.bodyId && partialSetup.bodyId !== this.state.currentBodyId) {
      this.state.currentBodyId = partialSetup.bodyId;
    }
    this.save();
    return profile;
  }

  updateActiveController(partialController, bodyNamesMap = {}, trackNamesMap = {}) {
    const profile = this.getActiveProfile(bodyNamesMap, trackNamesMap);
    profile.controller = {
      ...profile.controller,
      ...partialController,
      Bindings: {
        ...profile.controller.Bindings,
        ...(partialController.Bindings || {})
      }
    };
    profile.updatedAt = new Date().toISOString();
    this.save();
    return profile;
  }

  // Copia un profilo salvato (controller, assetto o entrambi) sull'auto e pista attualmente selezionate
  applySavedProfileToCurrent(sourceKey, copyMode = 'both', bodyNamesMap = {}, trackNamesMap = {}) {
    const source = this.state.autoProfiles[sourceKey];
    if (!source) return null;
    const current = this.getActiveProfile(bodyNamesMap, trackNamesMap);

    if (copyMode === 'controller' || copyMode === 'both') {
      current.controller = JSON.parse(JSON.stringify(source.controller));
    }
    if (copyMode === 'setup' || copyMode === 'both') {
      current.carSetup = {
        ...JSON.parse(JSON.stringify(source.carSetup)),
        bodyId: this.state.currentBodyId // mantiene la carrozzeria attuale
      };
    }
    current.updatedAt = new Date().toISOString();
    this.save();
    return current;
  }

  getAllProfilesList() {
    return Object.entries(this.state.autoProfiles).map(([key, val]) => ({
      key,
      ...val
    }));
  }

  recordLapTime(trackId, timeSec, bodyId) {
    const currentBest = this.state.lapRecords[trackId];
    if (!currentBest || timeSec < currentBest.timeSec) {
      this.state.lapRecords[trackId] = {
        timeSec,
        bodyId,
        date: new Date().toISOString()
      };
      this.save();
      return true; // Nuovo record!
    }
    return false;
  }

  exportFullConfigJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      simulator: 'Mini-Z Club Simulator',
      version: this.state.appVersion,
      state: this.state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `miniz-club-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importFullConfigJson(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const importedState = parsed.state || parsed;
    if (!importedState || typeof importedState !== 'object') {
      throw new Error('File di configurazione non valido');
    }
    const def = this.getDefaultState();
    this.state = {
      ...def,
      ...importedState,
      audio: { ...def.audio, ...(importedState.audio || {}) },
      display: { ...def.display, ...(importedState.display || {}) },
      autoProfiles: { ...def.autoProfiles, ...(importedState.autoProfiles || {}) },
      lapRecords: { ...def.lapRecords, ...(importedState.lapRecords || {}) }
    };
    this.save();
    return this.state;
  }
}
