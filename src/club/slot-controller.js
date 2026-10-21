// Real-model visual controllers and a skeleton-local grip. See references in
// docs/hand-controllers.md; this module never changes driving input or physics.
import * as THREE from 'three';
import {controllerParts} from './controller-models.js';

export function makeSlotController(id='cobra-plus'){
  const p=controllerParts(id),controller=new THREE.Group();controller.name='SlotController';
  controller.userData.model=p.id;controller.userData.modelName=p.spec.name;
  const housing=new THREE.Mesh(p.housing,p.material);housing.name='ControllerHousing';controller.add(housing);
  const shell=new THREE.Mesh(p.shell,p.shellMaterial);shell.name='ControllerShell';shell.renderOrder=1;controller.add(shell);
  // Raise the finger cup to the index joint. Previously the joint touched
  // the top of the blade while its curved contact bowl hung 18 mm below it.
  const pivot=new THREE.Group();pivot.name='ControllerTrigger';pivot.position.set(0,.058,-.020);
  const trigger=new THREE.Mesh(p.trigger,p.material);pivot.add(trigger);controller.add(pivot);
  // Millimetre-scale details cannot resolve the room shadow map reliably.
  // Retain normal physically lit materials, without self-shadow acne.
  for(const part of [housing,shell,trigger]){part.userData.controllerPart=true;part.castShadow=part.receiveShadow=false;}
  controller.userData.setThrottle=value=>pivot.rotation.x=-.28*THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);
  return controller;
}

const position = bone => bone.getWorldPosition(new THREE.Vector3());
function aim(root, bone, next, target){
  root.updateMatrixWorld(true);
  const from = position(next).sub(position(bone)).normalize(), to = target.clone().sub(position(bone)).normalize();
  const desired = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
}
function moveWrist(root, side, target){
  const upper = root.getObjectByName(`Bip01_${side}_UpperArm`), elbow = root.getObjectByName(`Bip01_${side}_Forearm`), wrist = root.getObjectByName(`Bip01_${side}_Hand`);
  root.updateMatrixWorld(true);
  const s = position(upper), e = position(elbow), w = position(wrist), rotation = wrist.getWorldQuaternion(new THREE.Quaternion());
  const l1 = s.distanceTo(e), l2 = e.distanceTo(w), direction = target.clone().sub(s), distance = THREE.MathUtils.clamp(direction.length(), Math.abs(l1 - l2) + .001, l1 + l2 - .001);
  direction.normalize();
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const bend = e.clone().sub(s).addScaledVector(direction, -e.clone().sub(s).dot(direction)).normalize();
  const solved = s.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
  aim(root, upper, elbow, solved); aim(root, elbow, wrist, target);
  root.updateMatrixWorld(true); wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
}

export function installSlotController(root, driving, model){
  const previous = root.getObjectByName('SlotController'); previous?.removeFromParent();
  const controller = driving ? makeSlotController(model) : new THREE.Group(), right = root.getObjectByName('Bip01_R_Hand');
  controller.name='SlotController';
  root.updateMatrixWorld(true);
  const knuckle = root.getObjectByName('Bip01_R_Finger2');
  const center = root.worldToLocal(position(knuckle)).add(new THREE.Vector3(-.020, .004, .018));
  controller.position.copy(center); root.add(controller); root.updateMatrixWorld(true); right.attach(controller);
  if (!driving){ controller.visible = false; return; }
  // Left palm supports the bottom. Solve both arm segments without stretching
  // the rig, preserving the wrist orientation instead of twisting the forearm.
  const left = root.getObjectByName('Bip01_L_Hand');
  moveWrist(root, 'L', position(left).add(new THREE.Vector3(.035, -.023, .012)));
  for (const side of ['R', 'L']) for (let finger = 1; finger <= 4; finger++){
    const base = root.getObjectByName(`Bip01_${side}_Finger${finger}`), mid = root.getObjectByName(`Bip01_${side}_Finger${finger}1`), end = root.getObjectByName(`Bip01_${side}_Finger${finger}2`);
    if (!base || !mid || !end) continue;
    root.updateMatrixWorld(true);
    const y = root.worldToLocal(position(base)).y;
    let a, b;
    if (side === 'R'){
      a = new THREE.Vector3(center.x - .008, y, center.z - (finger === 1 ? .038 : .023));
      b = new THREE.Vector3(center.x - .022, y - .004, center.z - (finger === 1 ? .027 : .003));
    } else {
      a = new THREE.Vector3(center.x - .007, y + .004, center.z - .024);
      b = new THREE.Vector3(center.x + .012, y + .010, center.z - .006);
    }
    aim(root, base, mid, root.localToWorld(a)); aim(root, mid, end, root.localToWorld(b));

  }
  // Thumb lies diagonally along the upper back of the handle.
  const thumb = root.getObjectByName('Bip01_R_Finger0'), thumbMid = root.getObjectByName('Bip01_R_Finger01');
  if (thumb && thumbMid) aim(root, thumb, thumbMid, root.localToWorld(new THREE.Vector3(center.x + .008, center.y + .033, center.z + .010)));
  // Solve a small pose table once. Runtime interpolation follows the moving
  // trigger without per-frame IK, stretching bones or rotating the whole hand.
  const base=root.getObjectByName('Bip01_R_Finger1'),mid=root.getObjectByName('Bip01_R_Finger11'),end=root.getObjectByName('Bip01_R_Finger12');
  const pivot=controller.getObjectByName('ControllerTrigger'),poses=[];
  if(base&&mid&&end)for(let i=0;i<=20;i++){
    controller.userData.setThrottle(i/20);root.updateMatrixWorld(true);
    // Aim the finger pad at the outer surface, allowing its skin thickness.
    const contact=pivot.localToWorld(new THREE.Vector3(-.002,-.039,-.018));
    aim(root,base,mid,contact);
    aim(root,mid,end,controller.localToWorld(new THREE.Vector3(-.022,.020,-.012)));
    poses.push([base.quaternion.clone(),mid.quaternion.clone()]);
  }
  root.userData.setThrottle=value=>{
    value=THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);
    controller.userData.setThrottle(value);
    if(poses.length){const x=value*20,i=Math.min(19,Math.floor(x)),f=x-i;
      base.quaternion.slerpQuaternions(poses[i][0],poses[i+1][0],f);
      mid.quaternion.slerpQuaternions(poses[i][1],poses[i+1][1],f);
    }
  };
  root.userData.setThrottle(0);
}

