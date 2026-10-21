export class ControllerManager {
  constructor(profileManager) {
    this.profileManager = profileManager;
    this.keysDown = new Set();
    this.rawSteer = 0;
    this.rawThrottle = 0;
    this.rawBrake = 0;
    this.processedSteer = 0;
    this.processedThrottle = 0;
    this.processedBrake = 0;

    this.connectedGamepadName = null;
    this.activeGamepadIndex = -1;
    this.preferredDevice = 'auto'; // 'auto' | 'keyboard' | '0' | '1' | '2' | '3'

    this.listeningForBinding = null;
    this.baselineAxes = [];

    // Stato iniziale a riposo di ogni periferica USB per evitare che una Button Box
    // o un interruttore fisso sterzi o acceleri l'auto da sola!
    this.deviceRestingState = new Map();

    this.onMarshalPressed = null;
    this.onRestartRacePressed = null;
    this.onCameraPressed = null;
    this.onReplayPressed = null;
    this.onDevicesChanged = null;

    this._prevMarshalBtn = false;
    this._prevCameraBtn = false;
    this._prevReplayBtn = false;

    this.initListeners();
  }

  isLikelyButtonBox(id = '') {
    return /button\s*box|buttonbox|b-box|pxn-cb|arduino\s*micro|sim\s*panel|switch\s*panel/i.test(id);
  }

  getConnectedDevices() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    return pads.map((p) => ({
      index: p.index,
      id: p.id,
      isButtonBox: this.isLikelyButtonBox(p.id),
      mapping: p.mapping
    }));
  }

  selectActivePad() {
    if (this.preferredDevice === 'keyboard') {
      this.connectedGamepadName = null;
      this.activeGamepadIndex = -1;
      return null;
    }

    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    if (pads.length === 0) {
      this.connectedGamepadName = null;
      this.activeGamepadIndex = -1;
      return null;
    }

    // Registra lo stato iniziale a riposo per ogni nuovo dispositivo
    for (const p of pads) {
      if (!this.deviceRestingState.has(p.index)) {
        this.deviceRestingState.set(p.index, {
          axes: p.axes.map((v) => v),
          buttons: p.buttons.map((b) => b.value),
          activeAxes: new Set(),
          activeButtons: new Set()
        });
      } else {
        const rest = this.deviceRestingState.get(p.index);
        p.axes.forEach((v, i) => {
          if (Math.abs(v - (rest.axes[i] ?? 0)) > 0.15) {
            rest.activeAxes.add(i);
          }
        });
        p.buttons.forEach((b, i) => {
          if (Math.abs(b.value - (rest.buttons[i] ?? 0)) > 0.25) {
            rest.activeButtons.add(i);
          }
        });
      }
    }

    // Se l'utente ha scelto un indice specifico dal menu
    if (this.preferredDevice !== 'auto') {
      const idx = Number(this.preferredDevice);
      const chosen = pads.find((p) => p.index === idx);
      if (chosen) {
        this.connectedGamepadName = chosen.id;
        this.activeGamepadIndex = chosen.index;
        return chosen;
      }
    }

    // Modalità 'auto':
    // 1. Esclude le Button Box se ci sono altri controller o se la Button Box non è stata toccata
    const nonButtonBoxPads = pads.filter((p) => !this.isLikelyButtonBox(p.id));
    const candidates = nonButtonBoxPads.length > 0 ? nonButtonBoxPads : [];

    // 2. Tra i candidati, preferisce quello con mapping 'standard' (Xbox/PlayStation/XInput) o su cui l'utente ha mosso una levetta
    const activelyMoved = candidates.find((p) => {
      const rest = this.deviceRestingState.get(p.index);
      return rest && (rest.activeAxes.size > 0 || rest.activeButtons.size > 0);
    });
    const standardPad = candidates.find((p) => p.mapping === 'standard');
    const selected = activelyMoved || standardPad || candidates[0] || null;

    this.connectedGamepadName = selected ? selected.id : null;
    this.activeGamepadIndex = selected ? selected.index : -1;
    return selected;
  }

  initListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;

      if (this.listeningForBinding && this.listeningForBinding.type === 'key') {
        e.preventDefault();
        const code = e.code;
        const cb = this.listeningForBinding.onComplete;
        const field = this.listeningForBinding.field;
        this.listeningForBinding = null;
        if (cb) cb(field, code);
        return;
      }

      this.keysDown.add(e.code);

      const profile = this.profileManager.getActiveProfile().controller;
      const b = profile.Bindings;

      if (e.code === b.keyMarshal && !e.repeat && this.onMarshalPressed) {
        this.onMarshalPressed();
      }
      if (e.code === 'Space' && !e.repeat && this.onRestartRacePressed) {
        e.preventDefault();
        this.onRestartRacePressed();
      }
      if (e.code === b.keyCamera && !e.repeat && this.onCameraPressed) {
        this.onCameraPressed();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('gamepadconnected', (e) => {
      this.deviceRestingState.set(e.gamepad.index, {
        axes: e.gamepad.axes.map((v) => v),
        buttons: e.gamepad.buttons.map((b) => b.value),
        activeAxes: new Set(),
        activeButtons: new Set()
      });
      this.selectActivePad();
      if (this.onDevicesChanged) this.onDevicesChanged();
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      this.deviceRestingState.delete(e.gamepad.index);
      this.selectActivePad();
      if (this.onDevicesChanged) this.onDevicesChanged();
    });
  }

  startListeningForBinding(field, type = 'pad_button', onComplete) {
    const pad = this.selectActivePad();
    this.baselineAxes = pad ? [...pad.axes] : [];
    this.listeningForBinding = { field, type, onComplete };
  }

  cancelListening() {
    this.listeningForBinding = null;
  }

  applyExpCurve(val, expPercent) {
    const sign = Math.sign(val);
    const abs = Math.min(1, Math.abs(val));
    const k = Math.max(-0.95, Math.min(0.95, expPercent / 100));
    const power = k < 0 ? 1 + Math.abs(k) * 1.8 : 1 / (1 + k * 1.5);
    return sign * Math.pow(abs, power);
  }

  applyDeadzone(val, dzPercent) {
    const dz = Math.max(0, Math.min(0.45, dzPercent / 100));
    if (Math.abs(val) <= dz) return 0;
    return (Math.sign(val) * (Math.abs(val) - dz)) / (1 - dz);
  }

  update(dt) {
    const ctrl = this.profileManager.getActiveProfile().controller;
    const b = ctrl.Bindings;

    // 1. Lettura Tastiera (Frecce + WASD)
    let keySteer = 0;
    if (this.keysDown.has(b.keyLeft) || this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) keySteer -= 1;
    if (this.keysDown.has(b.keyRight) || this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) keySteer += 1;

    let keyThr = 0;
    if (this.keysDown.has(b.keyThrottle) || this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) keyThr = 1;

    let keyBrk = 0;
    if (this.keysDown.has(b.keyBrake) || this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) keyBrk = 1;

    // 2. Lettura Joypad / Radiocomando USB (ignorando Button Box e interruttori bloccati)
    let padSteer = 0;
    let padThr = 0;
    let padBrk = 0;

    const pad = this.selectActivePad();

    if (pad) {
      const rest = this.deviceRestingState.get(pad.index);

      // Se siamo in modalità "Premi per assegnare" sul joypad: ascolta tutte le periferiche non-ButtonBox (o quella selezionata)
      if (this.listeningForBinding) {
        if (this.listeningForBinding.type === 'pad_axis') {
          for (let i = 0; i < pad.axes.length; i++) {
            const base = this.baselineAxes[i] ?? 0;
            if (Math.abs(pad.axes[i] - base) > 0.45) {
              if (rest) rest.activeAxes.add(i);
              const { field, onComplete } = this.listeningForBinding;
              this.listeningForBinding = null;
              if (onComplete) onComplete(field, i);
              break;
            }
          }
        } else if (this.listeningForBinding.type === 'pad_button') {
          for (let i = 0; i < pad.buttons.length; i++) {
            const baseBtn = rest?.buttons[i] ?? 0;
            if ((pad.buttons[i].pressed || pad.buttons[i].value > 0.6) && Math.abs(pad.buttons[i].value - baseBtn) > 0.35) {
              if (rest) rest.activeButtons.add(i);
              const { field, onComplete } = this.listeningForBinding;
              this.listeningForBinding = null;
              if (onComplete) onComplete(field, i);
              break;
            }
          }
        }
      }

      // Asse sterzo (solo se l'asse è stato effettivamente mosso dallo stato di riposo o è centrato vicino a 0)
      const steerAxIdx = b.padSteerAxis ?? 0;
      if (pad.axes[steerAxIdx] !== undefined) {
        const axVal = pad.axes[steerAxIdx];
        const isAxisUnlocked = rest ? (rest.activeAxes.has(steerAxIdx) || Math.abs(rest.axes[steerAxIdx] ?? 0) < 0.25) : true;
        if (isAxisUnlocked) {
          padSteer = axVal;
        }
      }

      // Acceleratore e Freno (solo se sbloccati dallo stato iniziale a riposo)
      if (b.padThrottleAxis >= 0 && pad.axes[b.padThrottleAxis] !== undefined) {
        const axVal = pad.axes[b.padThrottleAxis];
        const isUnlocked = rest ? rest.activeAxes.has(b.padThrottleAxis) : true;
        if (isUnlocked) {
          if (axVal < -0.05) padThr = -axVal;
          else if (axVal > 0.05) padBrk = axVal;
        }
      } else {
        const thrIdx = b.padThrottleBtn ?? 7;
        const brkIdx = b.padBrakeBtn ?? 6;
        const thrBtn = pad.buttons[thrIdx];
        const brkBtn = pad.buttons[brkIdx];
        if (thrBtn && (!rest || rest.activeButtons.has(thrIdx) || (rest.buttons[thrIdx] ?? 0) < 0.1)) {
          padThr = thrBtn.value;
        }
        if (brkBtn && (!rest || rest.activeButtons.has(brkIdx) || (rest.buttons[brkIdx] ?? 0) < 0.1)) {
          padBrk = brkBtn.value;
        }
      }

      // Pulsanti azione Joypad
      const mIdx = b.padMarshalBtn ?? 3;
      const marshalPressed = Boolean(pad.buttons[mIdx]?.pressed && (!rest || rest.activeButtons.has(mIdx)));
      if (marshalPressed && !this._prevMarshalBtn && this.onMarshalPressed) {
        this.onMarshalPressed();
      }
      this._prevMarshalBtn = marshalPressed;

      const cIdx = b.padCameraBtn ?? 1;
      const camPressed = Boolean(pad.buttons[cIdx]?.pressed && (!rest || rest.activeButtons.has(cIdx)));
      if (camPressed && !this._prevCameraBtn && this.onCameraPressed) {
        this.onCameraPressed();
      }
      this._prevCameraBtn = camPressed;

      const rIdx = b.padReplayBtn ?? 2;
      const replayPressed = Boolean(pad.buttons[rIdx]?.pressed && (!rest || rest.activeButtons.has(rIdx)));
      if (replayPressed && !this._prevReplayBtn && this.onReplayPressed) {
        this.onReplayPressed();
      }
      this._prevReplayBtn = replayPressed;
    }

    // Combina Tastiera e Joypad (la tastiera ha sempre priorità immediata quando premuta)
    this.rawSteer = Math.abs(keySteer) > 0.01 ? keySteer : (Math.abs(padSteer) > 0.04 ? padSteer : 0);
    this.rawThrottle = Math.max(padThr, keyThr);
    this.rawBrake = Math.max(padBrk, keyBrk);

    if (ctrl.invertSteering) this.rawSteer = -this.rawSteer;
    if (ctrl.invertThrottle) {
      const tmp = this.rawThrottle;
      this.rawThrottle = this.rawBrake;
      this.rawBrake = tmp;
    }

    // Deadzone + Exponential + Dual Rate + Trim
    const steerClean = this.applyDeadzone(this.rawSteer, ctrl.deadzone);
    const steerCurved = this.applyExpCurve(steerClean, ctrl.steeringExp);
    const dualRateFactor = (ctrl.steeringDualRate ?? 100) / 100;
    const trimOffset = (ctrl.steeringTrim ?? 0) / 100;
    const targetSteer = Math.max(-1.25, Math.min(1.25, steerCurved * dualRateFactor + trimOffset));

    // Velocità Servosterzo
    const servoRate = 10.0 * ((ctrl.servoSpeed ?? 100) / 100);
    const step = Math.min(1, servoRate * dt);
    this.processedSteer += (targetSteer - this.processedSteer) * step;

    // Gas e Freno con Esponenziale e EPA
    const thrClean = this.applyDeadzone(this.rawThrottle, Math.min(8, ctrl.deadzone));
    const thrCurved = this.applyExpCurve(thrClean, ctrl.throttleExp);
    const thrTrim = (ctrl.throttleTrim ?? 0) / 200;
    this.processedThrottle = Math.max(0, Math.min(1.15, thrCurved + thrTrim));

    const brkClean = this.applyDeadzone(this.rawBrake, Math.min(8, ctrl.deadzone));
    const brakeEpa = (ctrl.brakeStrength ?? 95) / 100;
    this.processedBrake = Math.max(0, Math.min(1.25, brkClean * brakeEpa));

    return {
      steer: this.processedSteer,
      throttle: this.processedThrottle,
      brake: this.processedBrake,
      rawSteer: this.rawSteer,
      rawThrottle: this.rawThrottle,
      rawBrake: this.rawBrake
    };
  }
}
