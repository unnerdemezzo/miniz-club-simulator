import * as THREE from 'three';
const point = bone => bone.getWorldPosition(new THREE.Vector3());
// Map a complete anatomical frame, including the elbow bend plane. A direction
// alone leaves the controller pose's axial twist in the sleeve and wrist.
function frame(axis, across){
  const x = axis.clone().normalize(), y = across.clone().addScaledVector(x, -across.dot(x)).normalize();
  return new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y));
}
function orient(bone, fromAxis, fromAcross, toAxis, toAcross){
  const delta = new THREE.Quaternion().setFromRotationMatrix(frame(toAxis, toAcross).multiply(frame(fromAxis, fromAcross).invert()));
  const world = delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
}
export function relaxStandingArms(root,stance=0){
  root.updateMatrixWorld(true);
  // Pose vectors belong to the character: forward is its local -Z. Mechanics
  // are already attached to a rotated station when their waiting pose changes.
  const characterRotation=root.getWorldQuaternion(new THREE.Quaternion());
  for (const side of ['R', 'L']){
    const s = side === 'R' ? 1 : -1;
    const upper = root.getObjectByName(`Bip01_${side}_UpperArm`), elbow = root.getObjectByName(`Bip01_${side}_Forearm`), wrist = root.getObjectByName(`Bip01_${side}_Hand`);
    const restingWrist=wrist.quaternion.clone();
    const oldUpper = point(elbow).sub(point(upper)), oldLower = point(wrist).sub(point(elbow));
    const down = new THREE.Vector3(s * .055, -.998, -.015),lower = new THREE.Vector3(s * .025, -.973, -.23);
    if(stance===1&&side==='R'){down.set(s*.10,-.98,-.16);lower.set(-s*.24,-.65,-.72);}
    if(stance===2){down.set(s*.10,-.99,-.05);lower.set(-s*.28,-.82,-.49);}
    if(stance===3&&side==='L'){down.set(s*.07,-.97,-.22);lower.set(-s*.16,-.55,-.82);}
    down.normalize().applyQuaternion(characterRotation);lower.normalize().applyQuaternion(characterRotation);
    orient(upper, oldUpper, oldLower, down, lower);
    root.updateMatrixWorld(true);
    const current = point(wrist).sub(point(elbow)).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(current, lower).multiply(elbow.getWorldQuaternion(new THREE.Quaternion()));
    elbow.quaternion.copy(elbow.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
    root.updateMatrixWorld(true);
    const middle = root.getObjectByName(`Bip01_${side}_Finger2`), index = root.getObjectByName(`Bip01_${side}_Finger1`), little = root.getObjectByName(`Bip01_${side}_Finger4`);
    if(stance)wrist.quaternion.copy(restingWrist);
    else orient(wrist, point(middle).sub(point(wrist)), point(little).sub(point(index)), new THREE.Vector3(s * .03, -.995, -.09).applyQuaternion(characterRotation), new THREE.Vector3(0, 0, 1).applyQuaternion(characterRotation));
    root.updateMatrixWorld(true);
  }
}
