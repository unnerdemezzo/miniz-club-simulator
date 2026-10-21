import * as THREE from 'three';

const point = o => o.getWorldPosition(new THREE.Vector3());

function aim(bone, child, target) {
  const from = point(child).sub(point(bone)).normalize();
  const to = target.clone().sub(point(bone)).normalize();
  const world = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(false, true);
}

export function reachArm(arm, target, pole, soft = false, anatomical = false) {
  const start = point(arm.sh), elbow = point(arm.el), wrist = point(arm.hand);
  const a = start.distanceTo(elbow), b = elbow.distanceTo(wrist), axis = target.clone().sub(start), raw = axis.length();
  axis.normalize();
  const limit = a + b - 0.002, edge = limit - 0.025;
  const reach = soft && raw > edge ? edge + 0.025 * (1 - Math.exp(-(raw - edge) / 0.025)) : raw;
  const d = THREE.MathUtils.clamp(reach, Math.abs(a - b) + 1e-5, a + b - 1e-5);
  const along = (a * a - b * b + d * d) / (2 * d), height = Math.sqrt(Math.max(0, a * a - along * along));
  const bend = pole.clone().sub(start);
  bend.addScaledVector(axis, -bend.dot(axis)).normalize();
  const elbowTarget = start.clone().addScaledVector(axis, along).addScaledVector(bend, height);
  const handTarget = start.clone().addScaledVector(axis, d);
  if (anatomical) {
    const frame = (upper, lower) => {
      const x = upper.clone().normalize(), y = lower.clone().addScaledVector(x, -lower.dot(x)).normalize();
      return new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y));
    };
    const before = frame(elbow.clone().sub(start), wrist.clone().sub(elbow));
    const after = frame(elbowTarget.clone().sub(start), handTarget.clone().sub(elbowTarget));
    const rotation = new THREE.Quaternion().setFromRotationMatrix(after.multiply(before.invert())).multiply(arm.sh.getWorldQuaternion(new THREE.Quaternion()));
    arm.sh.quaternion.copy(arm.sh.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
    arm.sh.updateWorldMatrix(false, true);
  } else {
    aim(arm.sh, arm.el, elbowTarget);
  }
  aim(arm.el, arm.hand, start.clone().addScaledVector(axis, d));
}
