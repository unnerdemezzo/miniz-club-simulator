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

      // Se siamo in modalità "Premi per assegnare" sul joypad: ascolta sia Assi analogici (grilletti/pedali) sia Bottoni!
      if (this.listeningForBinding) {
        if (this.listeningForBinding.type === 'pad_axis') {
          for (let i = 0; i < pad.axes.length; i++) {
            const base = this.baselineAxes[i] ?? 0;
            if (Math.abs(pad.axes[i] - base) > 0.40) {
              if (rest) rest.activeAxes.add(i);
              const { field, onComplete } = this.listeningForBinding;
              this.listeningForBinding = null;
              if (onComplete) onComplete(field, i);
              break;
            }
          }
        } else if (this.listeningForBinding.type === 'pad_button') {
          const { field, onComplete } = this.listeningForBinding;
          const isTriggerField = field === 'padThrottleBtn' || field === 'padBrakeBtn';
          let captured = false;

          // Per Acceleratore e Freno controlla prima se il grilletto/pedale muove un asse analogico dedicato
          if (isTriggerField) {
            const steerIdx = b.padSteerAxis ?? 0;
            for (let i = 0; i < pad.axes.length; i++) {
              if (i === steerIdx) continue;
              const base = this.baselineAxes[i] ?? 0;
              if (Math.abs(pad.axes[i] - base) > 0.45) {
                if (rest) rest.activeAxes.add(i);
                this.listeningForBinding = null;
                captured = true;
                if (onComplete) onComplete(field, `axis:${i}`);
                break;
              }
            }
          }

          if (!captured) {
            for (let i = 0; i < pad.buttons.length; i++) {
              const baseBtn = rest?.buttons[i] ?? 0;
              if ((pad.buttons[i].pressed || pad.buttons[i].value > 0.5) && Math.abs(pad.buttons[i].value - baseBtn) > 0.30) {
                if (rest) rest.activeButtons.add(i);
                this.listeningForBinding = null;
                if (onComplete) onComplete(field, i);
                break;
              }
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

      // Funzione di lettura proporzionale (0.00 -> 1.00) per Grilletto/Pedale Gas e Freno:
      // Rileva automaticamente se il grilletto del controller USB si muove su un Asse analogico (axes[2..9]) o su un Bottone analogico (buttons[6/7]),
      // e se un bottone ha un sensore digitale a scatto applica un'erogazione progressiva fluida!
      if (!this._btnAnalogDetected) this._btnAnalogDetected = new Set();
      if (!this._btnRamps) this._btnRamps = new Map();

      const readProportionalTrigger = (binding, defaultBtnIdx, isThrottle) => {
        const bind = binding ?? defaultBtnIdx;

        // 1. Se è mappato esplicitamente su un asse analogico (es. "axis:2")
        if (typeof bind === 'string' && bind.startsWith('axis:')) {
          const axIdx = Number(bind.split(':')[1]);
          if (pad.axes[axIdx] !== undefined) {
            const cur = pad.axes[axIdx];
            const restVal = rest?.axes[axIdx] ?? 0;
            if (rest && !rest.activeAxes.has(axIdx)) return 0;
            if (restVal < -0.45) {
              return Math.max(0, Math.min(1, (cur - restVal) / Math.max(0.2, 1 - restVal)));
            }
            if (restVal > 0.45) {
              return Math.max(0, Math.min(1, (restVal - cur) / Math.max(0.2, restVal + 1)));
            }
            return Math.max(0, Math.min(1, Math.abs(cur - restVal)));
          }
          return 0;
        }

        const btnIdx = Number(bind);
        const btn = pad.buttons[btnIdx];
        let val = 0;
        if (btn && (!rest || rest.activeButtons.has(btnIdx) || (rest.buttons[btnIdx] ?? 0) < 0.1)) {
          val = Math.max(0, Math.min(1, btn.value ?? (btn.pressed ? 1 : 0)));
          if (val > 0.04 && val < 0.96) {
            this._btnAnalogDetected.add(`${pad.index}:${btnIdx}`);
          }
        }

        // 2. Se il driver espone i grilletti analogici anche sugli assi (es. axes[2..7] con riposo a -1.0),
        // controlla se un asse grilletto sta dando un valore intermedio più preciso del bottone!
        const candidateAxes = isThrottle ? [5, 2, 4, 3] : [4, 2, 5, 3];
        const steerIdx = b.padSteerAxis ?? 0;
        for (const axIdx of candidateAxes) {
          if (axIdx === steerIdx || pad.axes[axIdx] === undefined) continue;
          if (rest && !rest.activeAxes.has(axIdx)) continue;
          const restVal = rest?.axes[axIdx] ?? 0;
          const cur = pad.axes[axIdx];
          if (restVal < -0.45) {
            const axNorm = Math.max(0, Math.min(1, (cur - restVal) / Math.max(0.2, 1 - restVal)));
            if (axNorm > 0.02 && (!this._btnAnalogDetected.has(`${pad.index}:${btnIdx}`) || val === 0)) {
              return axNorm;
            }
          }
        }

        // 3. Se il bottone ha già restituito valori analogici intermedi (0.05..0.95), usalo direttamente 1:1!
        const keyId = `${pad.index}:${btnIdx}`;
        if (this._btnAnalogDetected.has(keyId)) {
          return val;
        }

        // 4. Se invece il controller/tastiera invia solo 0 o 1 (on/off), applica una rampa progressiva morbida così non scatta mai ON/OFF!
        const prevRamp = this._btnRamps.get(keyId) || 0;
        const nextRamp =
          val > 0.5
            ? Math.min(1, prevRamp + dt * (isThrottle ? 2.1 : 2.5))
            : Math.max(0, prevRamp - dt * 5.5);
        this._btnRamps.set(keyId, nextRamp);
        return nextRamp;
      };

      // Acceleratore e Freno proporzionali 0% -> 100%
      if (b.padThrottleAxis >= 0 && pad.axes[b.padThrottleAxis] !== undefined) {
        const axVal = pad.axes[b.padThrottleAxis];
        const isUnlocked = rest ? rest.activeAxes.has(b.padThrottleAxis) : true;
        if (isUnlocked) {
          if (axVal < -0.03) padThr = Math.min(1, -axVal);
          else if (axVal > 0.03) padBrk = Math.min(1, axVal);
        }
      } else {
        padThr = readProportionalTrigger(b.padThrottleBtn, 7, true);
        padBrk = readProportionalTrigger(b.padBrakeBtn, 6, false);
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
    const usingKeySteer = Math.abs(keySteer) > 0.01;
    this.rawSteer = usingKeySteer ? keySteer : (Math.abs(padSteer) > 0.025 ? padSteer : 0);

    // Se si usa la tastiera, applica una rampa progressiva morbida così non è mai ON/OFF!
    if (keyThr > 0) {
      this._keyThrRamp = Math.min(1, (this._keyThrRamp || 0) + dt * 1.9);
    } else {
      this._keyThrRamp = Math.max(0, (this._keyThrRamp || 0) - dt * 5.0);
    }
    if (keyBrk > 0) {
      this._keyBrkRamp = Math.min(1, (this._keyBrkRamp || 0) + dt * 2.3);
    } else {
      this._keyBrkRamp = Math.max(0, (this._keyBrkRamp || 0) - dt * 6.0);
    }

    this.rawThrottle = Math.max(padThr, this._keyThrRamp);
    this.rawBrake = Math.max(padBrk, this._keyBrkRamp);

    if (ctrl.invertSteering) this.rawSteer = -this.rawSteer;
    if (ctrl.invertThrottle) {
      const tmp = this.rawThrottle;
      this.rawThrottle = this.rawBrake;
      this.rawBrake = tmp;
    }

    // Deadzone + Exponential + Dual Rate + Trim:
    // Usa sempre almeno -40% di esponenziale base sullo sterzo così il primo 50% della corsa della levetta è dolcissimo e millimetrico!
    const steerClean = this.applyDeadzone(this.rawSteer, Math.min(15, ctrl.deadzone ?? 6));
    const effectiveSteerExp = Math.min(-35, (ctrl.steeringExp ?? -35) - 15);
    const steerCurved = this.applyExpCurve(steerClean, effectiveSteerExp);
    const dualRateFactor = ((ctrl.steeringDualRate ?? 100) / 100) * 0.85;
    const trimOffset = (ctrl.steeringTrim ?? 0) / 100;
    const targetSteer = Math.max(-1.0, Math.min(1.0, steerCurved * dualRateFactor + trimOffset));

    // Ritorno immediato 1:1 con lo stick analogico: quando molli lo stick, le ruote seguono istantaneamente il ritorno dello stick!
    const isReturningToCenter =
      Math.abs(targetSteer) <= Math.abs(this.processedSteer) ||
      targetSteer * this.processedSteer <= 0;

    if (!usingKeySteer) {
      if (isReturningToCenter) {
        this.processedSteer = targetSteer;
      } else {
        const padRate = 18.0 * ((ctrl.servoSpeed ?? 100) / 100);
        this.processedSteer += (targetSteer - this.processedSteer) * Math.min(1, padRate * dt);
      }
    } else {
      // Con tastiera: sterzata progressiva e riallineamento immediato appena lasci il tasto
      const keyRate = isReturningToCenter ? 26.0 : 5.5 * ((ctrl.servoSpeed ?? 100) / 100);
      this.processedSteer += (targetSteer - this.processedSteer) * Math.min(1, keyRate * dt);
    }

    // Gas e Freno con curva progressiva morbida (mai ON/OFF) e EPA
    const thrClean = this.applyDeadzone(this.rawThrottle, Math.min(6, ctrl.deadzone ?? 5));
    const effectiveThrExp = Math.min(-35, (ctrl.throttleExp ?? 0) - 38);
    const thrCurved = this.applyExpCurve(thrClean, effectiveThrExp);
    const thrTrim = (ctrl.throttleTrim ?? 0) / 200;
    const targetThr = Math.max(0, Math.min(1.05, thrCurved + thrTrim));
    this.processedThrottle += (targetThr - this.processedThrottle) * Math.min(1, dt * 16);

    const brkClean = this.applyDeadzone(this.rawBrake, Math.min(6, ctrl.deadzone ?? 5));
    const brkCurved = this.applyExpCurve(brkClean, -42); // Frenata modulabile e progressiva
    const brakeEpa = (ctrl.brakeStrength ?? 95) / 100;
    const targetBrk = Math.max(0, Math.min(1.1, brkCurved * brakeEpa));
    this.processedBrake += (targetBrk - this.processedBrake) * Math.min(1, dt * 18);

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
