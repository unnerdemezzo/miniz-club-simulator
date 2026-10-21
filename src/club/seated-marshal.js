// Pose once at room load and bake the real marshal's detailed mesh. During a race
// this is an ordinary opaque mesh: no skeleton, idle timer or per-frame IK.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {loadPilotTemplate,instantiatePilot} from './realistic-pilot.js';
import {attachPersonLoading} from './person-loading.js';
import {reachArm} from './pit-crew.js';
import {freezeStaticTransforms} from './static-room.js';
export const MARSHAL_SEAT_HEIGHT=.43;
const bonePoint=bone=>bone.getWorldPosition(new T.Vector3());
// Bake skinning only once. Additional distant posts use the model's authored
// reduced mesh; the three existing identities retain their detailed bodies.
export function bakeMarshalRig(rig,options){
 rig.updateMatrixWorld(true);const source=rig.getObjectByName(options.reduced?'PilotBodyFar':'PilotBodyNear');source.skeleton.update();
 const geometry=source.geometry.clone(),positions=new Float32Array(geometry.attributes.position.count*3),point=new T.Vector3();
 for(let i=0;i<geometry.attributes.position.count;i++){source.getVertexPosition(i,point).applyMatrix4(source.matrixWorld);positions.set(point.toArray(),i*3);}
 geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeBoundingBox();
 geometry.translate(0,-geometry.boundingBox.min.y,0);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const actor=new T.Mesh(geometry,source.material);actor.castShadow=actor.receiveShadow=true;actor.userData.staticMarshal=true;return actor;
}
const frame=(axis,across)=>{const x=axis.clone().normalize(),y=across.clone().addScaledVector(x,-across.dot(x)).normalize();return new T.Matrix4().makeBasis(x,y,x.clone().cross(y));};
function legPose(upper,lower,foot,target,pole){
 const start=bonePoint(upper),a=bonePoint(lower).distanceTo(start),b=bonePoint(foot).distanceTo(bonePoint(lower)),axis=target.clone().sub(start),d=axis.length();axis.normalize();
 const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along)),bend=pole.clone().sub(start);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
 const knee=start.clone().addScaledVector(axis,along).addScaledVector(bend,height),across=new T.Vector3(1,0,0);
 for(const [bone,child,to] of [[upper,lower,knee],[lower,foot,target]]){
  const from=bonePoint(child).sub(bonePoint(bone)),desired=to.clone().sub(bonePoint(bone));
  const q=new T.Quaternion().setFromRotationMatrix(frame(desired,across).multiply(frame(from,across).invert())).multiply(bone.getWorldQuaternion(new T.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);
 }
}
export function seatedMarshalActor(template,options){
 const seatHeight=options.seatHeight??MARSHAL_SEAT_HEIGHT;
 const rig=instantiatePilot(template,{...options,pose:'stand',motion:false});
 rig.position.y=(seatHeight+.13)-rig.getObjectByName('Bip01_Pelvis').getWorldPosition(new T.Vector3()).y;
 rig.updateMatrixWorld(true);
 const bone=name=>rig.getObjectByName('Bip01_'+name);
 for(const [side,s] of [['L',-1],['R',1]]){
  const foot=bone(side+'_Foot'),orientation=foot.getWorldQuaternion(new T.Quaternion());
  legPose(bone(side+'_Thigh'),bone(side+'_Calf'),foot,new T.Vector3(s*.115,.10,-.32),new T.Vector3(s*.12,seatHeight+.02,-.60));
  foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(orientation));rig.updateMatrixWorld(true);
  const arm={sh:bone(side+'_UpperArm'),el:bone(side+'_Forearm'),hand:bone(side+'_Hand')};
  // Rest the hands over the thighs, with elbows beside the ribs. Solve the
  // elbow plane too: direction-only posing left the sleeves axially twisted.
  reachArm(arm,new T.Vector3(s*.13,seatHeight+.19,-.30),new T.Vector3(s*.23,seatHeight+.37,-.10),true,true);
 }
 const actor=bakeMarshalRig(rig,options);actor.name=options.label+' · seduto';actor.userData.staticSeatedMarshal=true;actor.userData.seatedJoints={};for(const n of ['Pelvis','L_Thigh','L_Calf','L_Foot','R_Thigh','R_Calf','R_Foot','L_UpperArm','L_Forearm','L_Hand','R_UpperArm','R_Forearm','R_Hand'])actor.userData.seatedJoints[n]=bonePoint(bone(n)).toArray();return actor;
}
export function makeSeatedMarshal(options,M){
 const seatHeight=options.seatHeight??MARSHAL_SEAT_HEIGHT;
 const root=new T.Group();root.name=options.label+' · sgabello';root.userData.castId=options.id;root.userData.staticMarshal=true;root.userData.seated=true;root.userData.seatHeight=seatHeight;
 const parts=[];
 const cylinder=(r,h,y)=>{const g=new T.CylinderGeometry(r,r,h,12);g.translate(0,y,0);parts.push(g);};
 cylinder(.17,.035,seatHeight-.0175);cylinder(.024,seatHeight-.035,(seatHeight-.035)/2);cylinder(.22,.018,.009);
 const stool=new T.Mesh(mergeGeometries(parts),M.darkMetal);stool.name=`Sgabello commissario · seduta ${Math.round(seatHeight*100)} cm`;stool.castShadow=stool.receiveShadow=true;root.add(stool);freezeStaticTransforms(stool);
 return attachPersonLoading(root,async()=>seatedMarshalActor(await loadPilotTemplate(options.model),options),{onActor:()=>freezeStaticTransforms(root)});
}
