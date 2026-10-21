import { DEFAULT_CAR_SETUP } from '../data/parts.js';

const STORAGE_KEY = 'miniz_club_sim_state_v1';

export const DEFAULT_CONTROLLER_PROFILE = {
  // Parametri stile radiocomando professionale (Kyosho / Futaba / FlySky Noble)
  steeringExp: -25,       // -100 a +100 (negativo = più dolce al centro)
  throttleExp: 0,         // -100 a +100
  steeringDualRate: 100,  // 40% a 130% (angolo massimo ruote)
  brakeStrength: 95,      // 20% a 130% (EPA freno)
  servoSpeed: 100,        // 30% a 150% (velocità risposta sterzo)
  deadzone: 6,            // 0% a 30% (zona morta levetta joypad)
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

export class ProfileManager {
  constructor() {
    this.state = this.loadFromStorage();
  }

  getDefaultState() {
    return {
      appVersion: '1.0.0',
      currentTrackId: 'club_veloce',
      reverseTrack: false,
      currentBodyId: 'ferrari_499p',
      graphicsQuality: 'high', // 'low' | 'medium' | 'high'
      audio: {
        commentaryEnabled: true,
        commentaryVolume: 0.95,
        motorVolume: 0.65,
        beepVolume: 0.85
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
            steeringDualRate: 115,
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
      return {
        ...def,
        ...parsed,
        audio: { ...def.audio, ...(parsed.audio || {}) },
        autoProfiles: { ...def.autoProfiles, ...(parsed.autoProfiles || {}) },
        lapRecords: { ...def.lapRecords, ...(parsed.lapRecords || {}) }
      };
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
      autoProfiles: { ...def.autoProfiles, ...(importedState.autoProfiles || {}) },
      lapRecords: { ...def.lapRecords, ...(importedState.lapRecords || {}) }
    };
    this.save();
    return this.state;
  }
}
