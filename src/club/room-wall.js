import * as THREE from 'three';
import {canvasTex,rng,speckle} from './util.js';
import {ROOM} from './config.js';
// The same paint, panel texture and finish in both club rooms.
export const ROOM_WALL_COLORS={upper:0xc6bfb2,lower:0x26303d,rail:0xa3141a,skirting:0x15181d};
let wallTexture;
export function clubWallTexture(){
 if(!wallTexture){const random=rng(21);wallTexture=canvasTex(1024,512,(g,w,h)=>{
  const split=h*(1-1.05/ROOM.h);
  g.fillStyle='#c6bfb2';g.fillRect(0,0,w,split);speckle(g,w,split,16000,['rgba(0,0,0,.035)','rgba(255,255,255,.05)'],1.5,random);
  const gradient=g.createLinearGradient(0,0,0,split);gradient.addColorStop(0,'rgba(0,0,0,.08)');gradient.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gradient;g.fillRect(0,0,w,split);
  g.fillStyle='#26303d';g.fillRect(0,split,w,h-split);speckle(g,w,h-split,4000,['rgba(255,255,255,.03)'],1.2,random);
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=3;for(let x=0;x<w;x+=256)g.strokeRect(x+18,split+22,220,h-split-70);
  g.strokeStyle='rgba(255,255,255,.06)';g.lineWidth=2;for(let x=0;x<w;x+=256)g.strokeRect(x+21,split+25,214,h-split-76);
 });}
 return wallTexture;
}
export function clubWallMaterial(M,length){
 const map=clubWallTexture().clone();map.needsUpdate=true;map.repeat.set(length/2.5,1);
 const normalMap=M.plasterN.clone();normalMap.needsUpdate=true;normalMap.repeat.set(length/1.5,ROOM.h/1.5);
 const material=new THREE.MeshStandardMaterial({map,normalMap,normalScale:new THREE.Vector2(.2,.2),roughness:.92});material.userData.clubWall=true;return material;
}
