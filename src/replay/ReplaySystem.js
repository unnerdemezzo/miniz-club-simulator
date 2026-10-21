import * as THREE from 'three';

export const REPLAY_CAMERAS = [
  { id: 'tv_auto', name: '📺 Regia TV Automatica' },
  { id: 'curb_low', name: '🛞 Rasoterra sul Cordolo' },
  { id: 'onboard_roof', name: '🏎️ On-Board (Cofano/Tetto)' },
  { id: 'chase_close', name: '🎯 Inseguimento Ravvicinato' },
  { id: 'driver_stand', name: '👀 Vista Palco di Guida' }
];

export class ReplaySystem {
  constructor() {
    this.maxFrames = 3600; // ~60 secondi a 60fps
    this.frames = [];
    this.isActive = false;
    this.isPlaying = true;
    this.playbackSpeed = 1.0;
    this.cursor = 0;
    this.cameraMode = 'tv_auto';

    this._lookTarget = new THREE.Vector3();
  }

  recordFrame(carState, lapTime) {
    if (this.isActive) return;

    this.frames.push({
      x: carState.x,
      y: carState.y,
      z: carState.z,
      heading: carState.heading,
      roll: carState.roll,
      pitch: carState.pitch,
      steerAngle: carState.steerAngle,
      wheelSpin: carState.wheelSpin,
      speed: carState.speed,
      braking: carState.braking,
      lapTime
    });

    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  clear() {
    this.frames = [];
    this.cursor = 0;
  }

  startReplay() {
    if (this.frames.length < 10) return false;
    this.isActive = true;
    this.isPlaying = true;
    // Parte dagli ultimi 12 secondi (o dall'inizio se più corto)
    this.cursor = Math.max(0, this.frames.length - 720);
    return true;
  }

  stopReplay() {
    this.isActive = false;
  }

  setCameraMode(modeId) {
    this.cameraMode = modeId;
  }

  update(dt, camera, trackData, driverEyePos) {
    if (!this.isActive || this.frames.length === 0) return null;

    if (this.isPlaying) {
      this.cursor += dt * 60 * this.playbackSpeed;
      if (this.cursor >= this.frames.length - 1) {
        this.cursor = 0;
      }
    }

    const idx0 = Math.max(0, Math.min(this.frames.length - 1, Math.floor(this.cursor)));
    const idx1 = Math.min(this.frames.length - 1, idx0 + 1);
    const alpha = this.cursor - idx0;

    const f0 = this.frames[idx0];
    const f1 = this.frames[idx1];

    // Interpolazione fluida del frame registrato
    let dHeading = f1.heading - f0.heading;
    while (dHeading > Math.PI) dHeading -= Math.PI * 2;
    while (dHeading < -Math.PI) dHeading += Math.PI * 2;

    const frame = {
      x: f0.x + (f1.x - f0.x) * alpha,
      y: f0.y + (f1.y - f0.y) * alpha,
      z: f0.z + (f1.z - f0.z) * alpha,
      heading: f0.heading + dHeading * alpha,
      roll: f0.roll + (f1.roll - f0.roll) * alpha,
      pitch: f0.pitch + (f1.pitch - f0.pitch) * alpha,
      steerAngle: f0.steerAngle + (f1.steerAngle - f0.steerAngle) * alpha,
      wheelSpin: f0.wheelSpin + (f1.wheelSpin - f0.wheelSpin) * alpha,
      speed: f0.speed + (f1.speed - f0.speed) * alpha,
      braking: f1.braking,
      lapTime: f0.lapTime,
      progressPercent: (this.cursor / Math.max(1, this.frames.length - 1)) * 100
    };

    this.applyReplayCamera(camera, frame, trackData, driverEyePos, dt);
    return frame;
  }

  applyReplayCamera(camera, frame, trackData, driverEyePos, dt) {
    const carPos = new THREE.Vector3(frame.x, frame.y + 0.025, frame.z);
    const forward = new THREE.Vector3(Math.sin(frame.heading), 0, Math.cos(frame.heading));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    if (this.cameraMode === 'onboard_roof') {
      // Micro-camera sul tetto della Mini-Z (altezza 5.2 cm da terra!)
      const camPos = carPos.clone().addScaledVector(forward, -0.015).add(new THREE.Vector3(0, 0.032, 0));
      camera.position.copy(camPos);
      camera.fov = 62;
      camera.updateProjectionMatrix();
      const lookAt = carPos.clone().addScaledVector(forward, 0.75).add(new THREE.Vector3(0, 0.01, 0));
      camera.lookAt(lookAt);
      return;
    }

    if (this.cameraMode === 'chase_close') {
      // Dietro la Mini-Z a 42 cm di distanza e 16 cm da terra
      const desired = carPos.clone().addScaledVector(forward, -0.42).add(new THREE.Vector3(0, 0.14, 0));
      camera.position.lerp(desired, Math.min(1, dt * 10));
      camera.fov = 52;
      camera.updateProjectionMatrix();
      const lookAt = carPos.clone().addScaledVector(forward, 0.25);
      camera.lookAt(lookAt);
      return;
    }

    if (this.cameraMode === 'curb_low') {
      // Telecamera rasoterra sul cordolo più vicino (a 5.5 cm da terra!)
      const waypoints = trackData?.waypoints || [{ x: 0, z: 0 }];
      let bestWp = waypoints[0];
      let bestDist = Infinity;
      for (const wp of waypoints) {
        const d = Math.hypot(wp.x - frame.x, wp.z - frame.z);
        if (d < bestDist) {
          bestDist = d;
          bestWp = wp;
        }
      }
      const desired = new THREE.Vector3(bestWp.x + 0.32, 0.065, bestWp.z + 0.25);
      camera.position.lerp(desired, Math.min(1, dt * 6));
      camera.fov = 42;
      camera.updateProjectionMatrix();
      this._lookTarget.lerp(carPos, Math.min(1, dt * 16));
      camera.lookAt(this._lookTarget);
      return;
    }

    if (this.cameraMode === 'driver_stand') {
      camera.position.copy(driverEyePos);
      camera.fov = 44;
      camera.updateProjectionMatrix();
      this._lookTarget.lerp(carPos, Math.min(1, dt * 14));
      camera.lookAt(this._lookTarget);
      return;
    }

    // Default: 'tv_auto' (Regia TV Automatica)
    const tvCams = trackData?.tvCameras || [
      { x: -3.0, y: 0.65, z: 1.85 },
      { x: 3.0, y: 0.60, z: 1.75 },
      { x: 0.0, y: 0.65, z: -2.1 }
    ];
    let bestCam = tvCams[0];
    let minD = Infinity;
    for (const tc of tvCams) {
      const d = Math.hypot(tc.x - frame.x, tc.z - frame.z);
      if (d < minD) {
        minD = d;
        bestCam = tc;
      }
    }
    camera.position.set(bestCam.x, bestCam.y, bestCam.z);
    // Zoom dinamico televisivo in base alla distanza della Mini-Z
    const dist = camera.position.distanceTo(carPos);
    camera.fov = Math.max(22, Math.min(48, 56 - dist * 6.2));
    camera.updateProjectionMatrix();
    this._lookTarget.lerp(carPos.clone().addScaledVector(right, 0.02), Math.min(1, dt * 14));
    camera.lookAt(this._lookTarget);
  }
}
