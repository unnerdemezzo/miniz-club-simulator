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
    this.listeningForBinding = null; // { target: 'padSteerAxis' | 'padThrottleBtn' | ..., onComplete }
    this.baselineAxes = [];

    this.onMarshalPressed = null;
    this.onCameraPressed = null;
    this.onReplayPressed = null;

    this._prevMarshalBtn = false;
    this._prevCameraBtn = false;
    this._prevReplayBtn = false;

    this.initListeners();
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
      if (e.code === b.keyCamera && !e.repeat && this.onCameraPressed) {
        this.onCameraPressed();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('gamepadconnected', (e) => {
      this.connectedGamepadName = e.gamepad.id;
    });

    window.addEventListener('gamepaddisconnected', () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const active = Array.from(pads).find(Boolean);
      this.connectedGamepadName = active ? active.id : null;
    });
  }

  startListeningForBinding(field, type = 'pad_button', onComplete) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find(Boolean);
    this.baselineAxes = pad ? [...pad.axes] : [];
    this.listeningForBinding = { field, type, onComplete };
  }

  cancelListening() {
    this.listeningForBinding = null;
  }

  // Applica curva esponenziale stile radiocomando RC (-100..+100)
  applyExpCurve(val, expPercent) {
    const sign = Math.sign(val);
    const abs = Math.min(1, Math.abs(val));
    const k = Math.max(-0.95, Math.min(0.95, expPercent / 100));
    // Se k < 0 (es. -30%), curva più morbida intorno allo zero (più precisione sul dritto)
    // Se k > 0, curva più aggressiva intorno allo zero
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

    // 1. Lettura Tastiera (Frecce + WASD sempre supportati oltre ai tasti personalizzati)
    let keySteer = 0;
    if (this.keysDown.has(b.keyLeft) || this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) keySteer -= 1;
    if (this.keysDown.has(b.keyRight) || this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) keySteer += 1;

    let keyThr = 0;
    if (this.keysDown.has(b.keyThrottle) || this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) keyThr = 1;

    let keyBrk = 0;
    if (this.keysDown.has(b.keyBrake) || this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) keyBrk = 1;

    // 2. Lettura Joypad / Radiocomando USB
    let padSteer = 0;
    let padThr = 0;
    let padBrk = 0;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find(Boolean);

    if (pad) {
      this.connectedGamepadName = pad.id;

      // Se siamo in modalità "Premi per assegnare" sul joypad
      if (this.listeningForBinding) {
        if (this.listeningForBinding.type === 'pad_axis') {
          for (let i = 0; i < pad.axes.length; i++) {
            const base = this.baselineAxes[i] ?? 0;
            if (Math.abs(pad.axes[i] - base) > 0.45) {
              const { field, onComplete } = this.listeningForBinding;
              this.listeningForBinding = null;
              if (onComplete) onComplete(field, i);
              break;
            }
          }
        } else if (this.listeningForBinding.type === 'pad_button') {
          for (let i = 0; i < pad.buttons.length; i++) {
            if (pad.buttons[i].pressed || pad.buttons[i].value > 0.6) {
              const { field, onComplete } = this.listeningForBinding;
              this.listeningForBinding = null;
              if (onComplete) onComplete(field, i);
              break;
            }
          }
        }
      }

      // Asse sterzo
      const steerAxIdx = b.padSteerAxis ?? 0;
      if (pad.axes[steerAxIdx] !== undefined) {
        padSteer = pad.axes[steerAxIdx];
      }

      // Acceleratore (Grilletto analogico o asse dedicato)
      if (b.padThrottleAxis >= 0 && pad.axes[b.padThrottleAxis] !== undefined) {
        const axVal = pad.axes[b.padThrottleAxis];
        if (axVal < -0.05) padThr = -axVal;
        else if (axVal > 0.05) padBrk = axVal;
      } else {
        const thrBtn = pad.buttons[b.padThrottleBtn ?? 7];
        const brkBtn = pad.buttons[b.padBrakeBtn ?? 6];
        if (thrBtn) padThr = thrBtn.value;
        if (brkBtn) padBrk = brkBtn.value;
      }

      // Pulsanti azione Joypad (Commissario, Visuale, Replay)
      const marshalPressed = Boolean(pad.buttons[b.padMarshalBtn ?? 3]?.pressed);
      if (marshalPressed && !this._prevMarshalBtn && this.onMarshalPressed) {
        this.onMarshalPressed();
      }
      this._prevMarshalBtn = marshalPressed;

      const camPressed = Boolean(pad.buttons[b.padCameraBtn ?? 1]?.pressed);
      if (camPressed && !this._prevCameraBtn && this.onCameraPressed) {
        this.onCameraPressed();
      }
      this._prevCameraBtn = camPressed;

      const replayPressed = Boolean(pad.buttons[b.padReplayBtn ?? 2]?.pressed);
      if (replayPressed && !this._prevReplayBtn && this.onReplayPressed) {
        this.onReplayPressed();
      }
      this._prevReplayBtn = replayPressed;
    }

    // Combina Tastiera e Joypad
    this.rawSteer = Math.abs(padSteer) > 0.02 ? padSteer : keySteer;
    this.rawThrottle = Math.max(padThr, keyThr);
    this.rawBrake = Math.max(padBrk, keyBrk);

    if (ctrl.invertSteering) this.rawSteer = -this.rawSteer;
    if (ctrl.invertThrottle) {
      const tmp = this.rawThrottle;
      this.rawThrottle = this.rawBrake;
      this.rawBrake = tmp;
    }

    // Deadzone + Exponential + Dual Rate + Trim
    let steerClean = this.applyDeadzone(this.rawSteer, ctrl.deadzone);
    let steerCurved = this.applyExpCurve(steerClean, ctrl.steeringExp);
    const dualRateFactor = (ctrl.steeringDualRate ?? 100) / 100;
    const trimOffset = (ctrl.steeringTrim ?? 0) / 100;
    const targetSteer = Math.max(-1.25, Math.min(1.25, steerCurved * dualRateFactor + trimOffset));

    // Velocità Servosterzo (più alta = più immediata)
    const servoRate = 10.0 * ((ctrl.servoSpeed ?? 100) / 100);
    const step = Math.min(1, servoRate * dt);
    this.processedSteer += (targetSteer - this.processedSteer) * step;

    // Gas e Freno con Esponenziale e EPA
    let thrClean = this.applyDeadzone(this.rawThrottle, Math.min(8, ctrl.deadzone));
    let thrCurved = this.applyExpCurve(thrClean, ctrl.throttleExp);
    const thrTrim = (ctrl.throttleTrim ?? 0) / 200;
    this.processedThrottle = Math.max(0, Math.min(1.15, thrCurved + thrTrim));

    let brkClean = this.applyDeadzone(this.rawBrake, Math.min(8, ctrl.deadzone));
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
