// Microsoft Rocketbox character library, MIT. Attribution: assets/pilot/LICENSE.txt.
// One atlas, one skin draw per LOD, plus a rigid controller attached to the hand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makePerson } from './people.js';
import { attachPersonLoading } from './person-loading.js';
import { installSlotController } from './slot-controller.js';
import { relaxStandingArms } from './standing-pose.js';
import { createPersonMotion } from './person-motion.js';
import {installGuestOutfit} from './guest-outfit.js';

export const PILOT_MODELS = ['pilot', 'ponytail', 'cropped', 'receding', 'longhair', 'ninco-paolo', 'ninco-enrico', 'ninco-davide', 'guest-elena', 'guest-marta', 'guest-alice', 'marshal-roberto', 'marshal-stefano', 'marshal-andrea'];
const templates = new Map();
const variants = new Map();
const VARIANTS = new Set(['blue', 'red', 'ochre', 'marshal', 'marshal2', 'purple', 'teal', 'green', 'cropped-marshal', 'receding-marshal', 'mechanic-enzo', 'mechanic-leo', 'mechanic-karim', 'mechanic-marco']);
export function loadPilotVariant(name){
  if (!VARIANTS.has(name)&&name!=='guest-elena-casual') return Promise.reject(new Error('Variante sconosciuta: ' + name));
  if (!variants.has(name)){
    const url = new URL('/assets/pilot/' + name + (name.startsWith('mechanic-')||name==='guest-elena-casual' ? '.png' : '.jpg'), window.location.origin);
    const promise = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Texture ${name}: HTTP ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        const texture = new THREE.Texture(bitmap);
        texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4; texture.needsUpdate = true;
        return texture;
      } finally { clearTimeout(timer); }
    })().catch(error => { variants.delete(name); throw error; });
    variants.set(name, promise);
  }
  return variants.get(name);
}
export function loadPilotTemplate(model = 'pilot'){
  if (!PILOT_MODELS.includes(model)) return Promise.reject(new Error('Modello sconosciuto: ' + model));
  if (!templates.has(model)){
    const url = new URL('/assets/pilot/' + model + '.glb', window.location.origin);
    const promise = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Modello ${model}: HTTP ${response.status}`);
        return (await new GLTFLoader().parseAsync(await response.arrayBuffer(), url.href)).scene;
      } finally { clearTimeout(timer); }
    })().catch(error => { templates.delete(model); throw error; });
    templates.set(model, promise);
  }
  return templates.get(model);
}

// Kept separate from I/O so the real rig, culling bounds and LOD can be tested.
export function instantiatePilot(template, options = {}){
  const root = clone(template);
  root.name = 'Pilota realistico';
  const near = root.getObjectByName('PilotBodyNear'), far = root.getObjectByName('PilotBodyFar');
  if (!near?.isSkinnedMesh || !far?.isSkinnedMesh) throw new Error('Rig del pilota incompleto');
  far.skeleton = near.skeleton;
  far.visible = false;
  if (options.texture){
    const material = near.material.clone();
    material.map = options.texture;
    near.material = far.material = material;
  }
  installSlotController(root, !options.pose || options.pose === 'drive', options.controller);
  if (options.pose && options.pose !== 'drive'){
    relaxStandingArms(root);
    if(options.stance)relaxStandingArms(root,options.stance);
    if(options.relaxedGuest){
      // A small asymmetry in the shoulders and head, with hips/feet untouched.
      // Spine also parents the thighs in this rig; use Spine2 to leave the
      // support legs and feet exactly where they were authored.
      for(const [name,angle] of [['Spine2',.035],['Head',-.025]]){
        const bone=root.getObjectByName('Bip01_'+name),axis=new THREE.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
        bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));root.updateMatrixWorld(true);
      }
    }
    root.getObjectByName('SlotController').visible = false;
  }
  if (options.height) root.scale.setScalar(options.height / 1.75);
  if (options.width) root.scale.x *= options.width;
  if (options.faceWidth) root.getObjectByName('Bip01_Head').scale.x *= options.faceWidth;
  root.updateMatrixWorld(true); near.skeleton.update();
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = !object.userData.controllerPart;
    if (object.isSkinnedMesh){
      object.computeBoundingSphere();
      // Geometry is authored in cm; reserve 20 cm for breathing and the step.
      object.boundingSphere.radius += 20;
    }
  });
  // This blonde atlas already contains the face's soft shading. Its thin,
  // double-sided hair cards produce heavy self-shadow blotches at podium
  // distances. Keep directional lighting and cast shadows, but avoid that
  // extra shadow-map layer on the textured body in both LODs.
  if(['ponytail','longhair'].includes(options.model)||options.model?.startsWith('guest-')){
    near.receiveShadow=far.receiveShadow=false;
    // The face atlas already carries photographed shading. A restrained
    // texture-coloured fill on its face/neck region prevents that shading
    // from becoming a second dark layer under the mouth in the room lights.
    const material=near.material.clone();
    material.emissiveMap=material.map;
    material.emissive.setRGB(1,1,1);material.emissiveIntensity=.16;
    const guestAtlas=options.model?.startsWith('guest-');
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        totalEmissiveRadiance *= smoothstep(0.50,0.54,vEmissiveMapUv.x)
          * smoothstep(${guestAtlas?'0.50,0.54':'0.07,0.11'},vEmissiveMapUv.y)
          * (1.0-smoothstep(${guestAtlas?'0.96,1.00':'0.36,0.40'},vEmissiveMapUv.y));`);
    };
    material.customProgramCacheKey=()=> guestAtlas?'club-guest-face-fill-v1':'club-female-face-fill-v1';
    near.material=far.material=material;
    // Keep the detailed face at normal room distances, rather than letting
    // the heavily reduced mouth/chin mesh form dark patches at the podium.
    root.userData.detailedFace=true;
  }
  if(options.clothingTexture){const material=near.material.clone();material.onBeforeCompile=near.material.onBeforeCompile;installGuestOutfit(material,options.clothingTexture);near.material=far.material=material;}
  const joints = {};
  for (const [key, name, worldAxis] of [
    ['head', 'Bip01_Head', [0, 1, 0]], ['headPitch', 'Bip01_Head', [1, 0, 0]],
    ['spine', 'Bip01_Spine2', [1, 0, 0]], ['weight', 'Bip01_Spine2', [0, 0, 1]],
    ['leftArm', 'Bip01_L_UpperArm', [1, 0, 0]], ['leftElbow', 'Bip01_L_Forearm', [1, 0, 0]],
    ['rightLeg', 'Bip01_R_Thigh', [0, 0, 1]], ['leftLeg', 'Bip01_L_Thigh', [0, 0, 1]],
    ['rightKnee', 'Bip01_R_Calf', [1, 0, 0]], ['leftKnee', 'Bip01_L_Calf', [1, 0, 0]]
  ]){
    const bone = root.getObjectByName(name);
    if (!bone) throw new Error(`Osso mancante: ${name}`);
    joints[key] = { bone, rest: bone.quaternion.clone(), axis: new THREE.Vector3(...worldAxis).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()) };
  }
  const delta = new THREE.Quaternion();
  const rotate = (key, angle) => { const j = joints[key]; j.bone.quaternion.copy(j.rest).multiply(delta.setFromAxisAngle(j.axis, angle)); };
  const addRotation=(key,angle)=>{const j=joints[key];j.bone.quaternion.multiply(delta.setFromAxisAngle(j.axis,angle));};
  let time = 0, distant = false, wasWalking=false;
  const motion=createPersonMotion(options);
  // Mechanics adjust their waiting arms once at construction. Capture that
  // specific rest pose before adding idle motion; service owns the rig while busy.
  root.userData.captureIdlePose=()=>{for(const j of Object.values(joints))j.rest.copy(j.bone.quaternion);};
  root.userData.kind = 'realistic';
  root.userData.setDetail = distance => {
    // Hysteresis prevents flicker when a camera sits near the changeover distance.
    const face=root.userData.detailedFace;
    distant = distant ? distance > (face?10:5.1) : distance > (face?11:5.9);
    near.visible = !distant; far.visible = distant;
    root.userData.detail = distant ? 'far' : 'near';
  };
  root.userData.animate = (dt, moving = 0, distance = 0) => {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    if (!root.visible) return false;
    time += dt;
    root.userData.setDetail(distance);
    const pose=motion.update(dt,distance);
    if(!pose)return false;
    rotate('head',pose.headYaw);addRotation('headPitch',pose.headPitch);
    rotate('spine',pose.breath);addRotation('weight',pose.weight);
    if(motion.role!=='driver'){rotate('leftArm',pose.arm);rotate('leftElbow',pose.elbow);}
    const walk = Math.min(1, Math.max(0, moving) * 3), phase = time * 7;
    if(walk||wasWalking){
      rotate('rightLeg', Math.sin(phase) * 0.12 * walk);
      rotate('leftLeg', -Math.sin(phase) * 0.12 * walk);
      rotate('rightKnee', Math.max(0, Math.sin(phase)) * 0.1 * walk);
      rotate('leftKnee', Math.max(0, -Math.sin(phase)) * 0.1 * walk);
    }
    wasWalking=!!walk;
    return true;
  };
  root.userData.setDetail(0);
  return root;
}

export function makeRealisticPilot(options = {}){
  const holder = new THREE.Group();
  holder.name = options.label || 'Persona del club'; holder.userData.kind = 'loading';
  holder.userData.castId=options.id;holder.userData.appearanceId=options.model;
  let actor = null;
  holder.userData.animate = (dt, moving, distance) => {
    if (actor && holder.visible) actor.userData.animate?.(dt, moving, distance);
  };
  holder.userData.setThrottle = value => actor?.userData.setThrottle?.(value);
  return attachPersonLoading(holder, async () => {
    const [template, texture, clothingTexture] = await Promise.all([
    loadPilotTemplate(options.model), options.variant ? loadPilotVariant(options.variant) : Promise.resolve(null),options.clothingVariant?loadPilotVariant(options.clothingVariant):Promise.resolve(null)
    ]);
    return instantiatePilot(template, { ...options, texture,clothingTexture });
  }, {fallback:options.fallback===false?null:()=>{actor=makePerson(options);return actor;},onActor:next=>{actor=next;}});
}
