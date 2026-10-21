import * as T from 'three';
import {CLUB_TRACKS} from './club-tracks.js';
import {MARSHAL_CAST} from './character-cast.js';
import {FLOOR} from './config.js';
import {makeSeatedMarshal,bakeMarshalRig} from './seated-marshal.js';
import {loadPilotTemplate,instantiatePilot} from './realistic-pilot.js';
import {attachPersonLoading} from './person-loading.js';
import {freezeStaticTransforms} from './static-room.js';

function makeStandingMarshal(options){
 const root=new T.Group();root.name=options.label+' · in piedi';root.userData.castId=options.id;root.userData.staticMarshal=true;
 return attachPersonLoading(root,async()=>{
  const rig=instantiatePilot(await loadPilotTemplate(options.model),{...options,pose:'stand',motion:false});
  const actor=bakeMarshalRig(rig,options);actor.name=options.label+' · corpo fisso';return actor;
 },{onActor:()=>freezeStaticTransforms(root)});
}

// Keep the rendered post and the recovery scheduler on the same coordinates.
// Marshals look at their assigned bend, with no idle, turning or skeleton work.
export function buildRoomMarshals(scene,club,M){
 const track=CLUB_TRACKS[club.trackId];let seats;
 for(const [i,[x,y]] of track.marshalPositions.entries()){
  const zone=track.marshalZones?.[i],extra=i>=MARSHAL_CAST.length;
  const options={...MARSHAL_CAST[i%MARSHAL_CAST.length],shirt:0x2b2f38,vest:true,seatHeight:track.marshalSeatHeight,
   ...(extra?{id:`marshal-${club.trackId}-${i+1}`,label:`Commissario ${zone?.name||'settore '+(i+1)}`,height:1.76,width:.96,faceWidth:.94,reduced:true}:{})};
  const p=track.seatedMarshals?makeSeatedMarshal(options,M):makeStandingMarshal(options);
  p.position.set(x,FLOOR,-y);p.rotation.y=zone?.heading??Math.atan2(x-(track.center?.[0]??2.45),-y-(track.center?.[2]??-1.9));
  p.userData.recoverySector=zone?.name||`Settore ${i+1}`;p.userData.fixedHeading=p.rotation.y;
  scene.add(p);club.marshals.push(p);club.backgroundPeople.push(p);
  if(track.seatedMarshals){
   // All stools share one immutable instanced draw instead of one per post.
   const stool=p.children.find(o=>o.isMesh);p.remove(stool);p.updateMatrix();
   if(!seats){seats=new T.InstancedMesh(stool.geometry,M.darkMetal,track.marshalPositions.length);seats.name='Sgabelli commissari · disegno unico';seats.castShadow=seats.receiveShadow=true;}
   else stool.geometry.dispose();
   seats.setMatrixAt(i,p.matrix);
  }
 }
 if(seats){seats.instanceMatrix.needsUpdate=true;seats.computeBoundingBox();seats.computeBoundingSphere();scene.add(seats);freezeStaticTransforms(seats);club.marshalSeats=seats;}
 return club.marshals;
}
