// Radiocomando RC 2.4GHz a pistola con volantino laterale in spugna (stile Kyosho Syncro KT-531P / FlySky Noble NB4)
import * as THREE from 'three';

export function makeSlotController(id = 'noble-nb4') {
  const controller = new THREE.Group();
  controller.name = 'SlotController';
  controller.userData.model = id;
  controller.userData.modelName = 'Radiocomando RC 2.4GHz a Volantino';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.38,
    metalness: 0.45
  });
  const accentColors = {
    'cobra-plus': 0xdc2626,
    'ds-pro': 0x0284c7,
    'professor-motor': 0xeab308,
    'slotit-scp3': 0x16a34a
  };
  const accentHex = accentColors[id] || 0xdc2626;
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.25,
    metalness: 0.78
  });
  const foamMat = new THREE.MeshStandardMaterial({
    color: 0x1f242d,
    roughness: 0.88,
    metalness: 0.05
  });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  // 1. Impugnatura ergonomica a pistola (Pistol Grip)
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.115, 0.044), bodyMat);
  grip.position.set(0, -0.015, 0.005);
  grip.rotation.x = 0.18;
  grip.name = 'ControllerHousing';
  controller.add(grip);

  // Base batteria LiFe inferiore del radiocomando
  const baseFoot = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.022, 0.078), bodyMat);
  baseFoot.position.set(0, -0.072, -0.008);
  controller.add(baseFoot);

  // 2. Corpo superiore / Torretta 2.4GHz con schermo LCD inclinabile e antenna interna
  const upperBody = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.054, 0.118), bodyMat);
  upperBody.position.set(0, 0.052, -0.018);
  upperBody.name = 'ControllerShell';
  controller.add(upperBody);

  // Fregi anodizzati racing sulla scocca della radio
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.010, 0.092), accentMat);
  topTrim.position.set(0, 0.076, -0.015);
  controller.add(topTrim);

  // Display touch superiore telemetria 2.4GHz
  const lcdFrame = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.008, 0.056), accentMat);
  lcdFrame.position.set(0, 0.082, 0.006);
  lcdFrame.rotation.x = 0.25;
  const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.046), screenMat);
  lcdScreen.position.set(0, 0.087, 0.006);
  lcdScreen.rotation.x = -Math.PI / 2 + 0.25;
  controller.add(lcdFrame, lcdScreen);

  // Antenna 2.4GHz FHSS anteriore
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.048, 10), bodyMat);
  antenna.position.set(0, 0.092, -0.058);
  antenna.rotation.x = -0.22;
  controller.add(antenna);

  // 3. VOLANTINO DI STERZO LATERALE (Drop-down Steering Wheel con corona in spugna e cerchio anodizzato)
  const wheelPod = new THREE.Group();
  wheelPod.name = 'SteeringWheelPod';
  // Posizionato sul fianco esterno della radio per essere impugnato con l'altra mano!
  wheelPod.position.set(-0.038, 0.044, -0.024);
  controller.add(wheelPod);

  const hubShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.024, 16), bodyMat);
  hubShaft.rotation.z = Math.PI / 2;
  wheelPod.add(hubShaft);

  const steeringWheelGroup = new THREE.Group();
  steeringWheelGroup.name = 'RCWheelRotor';
  steeringWheelGroup.position.set(-0.014, 0, 0);
  wheelPod.add(steeringWheelGroup);

  // Corona in spugna nera ad alto grip (diametro 56mm reale)
  const foamTire = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.020, 24), foamMat);
  foamTire.rotation.z = Math.PI / 2;
  // Cerchio interno forato in alluminio anodizzato
  const alloyRim = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 20), accentMat);
  alloyRim.rotation.z = Math.PI / 2;
  const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.023, 0.040, 0.005), bodyMat);
  const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.023, 0.005, 0.040), bodyMat);
  steeringWheelGroup.add(foamTire, alloyRim, spoke1, spoke2);

  // 4. Grilletto Proporzionale Gas / Freno (Trigger anteriore per il dito indice)
  const pivot = new THREE.Group();
  pivot.name = 'ControllerTrigger';
  pivot.position.set(0, 0.042, -0.022);
  const triggerBlade = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.034, 0.018), accentMat);
  triggerBlade.position.set(0, -0.018, -0.012);
  pivot.add(triggerBlade);
  controller.add(pivot);

  controller.traverse((part) => {
    if (part.isMesh) {
      part.userData.controllerPart = true;
      part.castShadow = false;
      part.receiveShadow = false;
    }
  });

  controller.userData.setThrottle = (value) => {
    const v = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
    pivot.rotation.x = -0.28 * v;
    // Ruota leggermente anche il volantino laterale per simulare le correzioni di sterzo del pilota!
    steeringWheelGroup.rotation.x = Math.sin(v * Math.PI * 2.5) * 0.45;
  };

  return controller;
}

const position = (bone) => bone.getWorldPosition(new THREE.Vector3());

function aim(root, bone, next, target) {
  root.updateMatrixWorld(true);
  const from = position(next).sub(position(bone)).normalize();
  const to = target.clone().sub(position(bone)).normalize();
  const desired = new THREE.Quaternion()
    .setFromUnitVectors(from, to)
    .multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
}

function moveWrist(root, side, target) {
  const upper = root.getObjectByName(`Bip01_${side}_UpperArm`);
  const elbow = root.getObjectByName(`Bip01_${side}_Forearm`);
  const wrist = root.getObjectByName(`Bip01_${side}_Hand`);
  if (!upper || !elbow || !wrist) return;
  root.updateMatrixWorld(true);
  const s = position(upper);
  const e = position(elbow);
  const w = position(wrist);
  const rotation = wrist.getWorldQuaternion(new THREE.Quaternion());
  const l1 = s.distanceTo(e);
  const l2 = e.distanceTo(w);
  const direction = target.clone().sub(s);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
  direction.normalize();
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const bend = e.clone().sub(s).addScaledVector(direction, -e.clone().sub(s).dot(direction)).normalize();
  const solved = s
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
  aim(root, upper, elbow, solved);
  aim(root, elbow, wrist, target);
  root.updateMatrixWorld(true);
  wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
}

export function installSlotController(root, driving, model) {
  const previous = root.getObjectByName('SlotController');
  previous?.removeFromParent();
  const controller = driving ? makeSlotController(model) : new THREE.Group();
  const right = root.getObjectByName('Bip01_R_Hand');
  controller.name = 'SlotController';
  root.updateMatrixWorld(true);
  const knuckle = root.getObjectByName('Bip01_R_Finger2');
  if (!right || !knuckle) return;

  const center = root.worldToLocal(position(knuckle)).add(new THREE.Vector3(-0.02, 0.004, 0.018));
  controller.position.copy(center);
  root.add(controller);
  root.updateMatrixWorld(true);
  right.attach(controller);
  if (!driving) {
    controller.visible = false;
    return;
  }

  // Posiziona la mano sinistra esattamente sul volantino laterale in spugna del radiocomando RC 2.4GHz!
  const wheelPod = controller.getObjectByName('SteeringWheelPod');
  if (wheelPod) {
    root.updateMatrixWorld(true);
    const wheelWorld = wheelPod.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-0.025, 0.01, 0.01));
    moveWrist(root, 'L', wheelWorld);
  }

  const base = root.getObjectByName('Bip01_R_Finger1');
  const mid = root.getObjectByName('Bip01_R_Finger11');
  const end = root.getObjectByName('Bip01_R_Finger12');
  const pivot = controller.getObjectByName('ControllerTrigger');
  const poses = [];
  if (base && mid && end && pivot) {
    for (let i = 0; i <= 20; i++) {
      controller.userData.setThrottle(i / 20);
      root.updateMatrixWorld(true);
      const contact = pivot.localToWorld(new THREE.Vector3(-0.002, -0.028, -0.015));
      aim(root, base, mid, contact);
      aim(root, mid, end, controller.localToWorld(new THREE.Vector3(-0.022, 0.02, -0.012)));
      poses.push([base.quaternion.clone(), mid.quaternion.clone()]);
    }
  }

  root.userData.setThrottle = (value) => {
    value = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
    controller.userData.setThrottle(value);
    if (poses.length && base && mid) {
      const x = value * 20;
      const i = Math.min(19, Math.floor(x));
      const f = x - i;
      base.quaternion.slerpQuaternions(poses[i][0], poses[i + 1][0], f);
      mid.quaternion.slerpQuaternions(poses[i][1], poses[i + 1][1], f);
    }
  };
  root.userData.setThrottle(0);
}
