// Photo-based visual reconstructions of Mini-Z RC pistol-grip transmitters.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const HAND_CONTROLLERS=Object.freeze({
 'cobra-plus':{name:'Kyosho Syncro KT-531P',family:'cobra',shell:0x22262b,core:0x17191c},
 'cobra-clear':{name:'Flysky Noble NB4 Pro',family:'cobra',shell:0x2a2e34,core:0x9c732e},
 'ds-blue':{name:'Futaba 10PX · Blu',family:'ds',shell:0x21bde6,core:0x075a77},
 'ds-orange':{name:'Sanwa M17 · Arancio',family:'ds',shell:0xffb522,core:0xa85c09}
});
const cache=new Map();
const metal=0xadb6bc,dark=0x191c20;
function silhouette(points,width,inset=0){
 const s=new THREE.Shape();let v=points.map(([z,y])=>new THREE.Vector2(-z,y));
 if(inset){
  const winding=Math.sign(THREE.ShapeUtils.area(v));
  const normals=v.map((p,i)=>{const d=v[(i+1)%v.length].clone().sub(p).normalize();return new THREE.Vector2(-d.y,d.x).multiplyScalar(winding);});
  v=v.map((p,i)=>{const a=normals[(i+v.length-1)%v.length],b=normals[i];return p.clone().addScaledVector(a.clone().add(b),inset/(1+a.dot(b)));});
 }
 v.forEach((p,i)=>{const previous=v[(i+v.length-1)%v.length],next=v[(i+1)%v.length];
  const a=p.clone().lerp(previous,Math.min(.2,.003/p.distanceTo(previous))),b=p.clone().lerp(next,Math.min(.2,.003/p.distanceTo(next)));
  s[i?'lineTo':'moveTo'](a.x,a.y);s.quadraticCurveTo(p.x,p.y,b.x,b.y);
 });s.closePath();
 const g=new THREE.ExtrudeGeometry(s,{depth:width,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.0015,bevelThickness:.0015,curveSegments:3});
 g.translate(0,0,-width/2);g.rotateY(Math.PI/2);return g;
}
function geometryBuilder(){
 const pieces=[];
 const add=(g,color,pos=[0,0,0],rot=[0,0,0],print=false)=>{
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(1,1,1)));
  if(g.index)g=g.toNonIndexed();
  const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3),uv=g.attributes.uv;
  for(let i=0;i<g.attributes.position.count;i++){colors.set([c.r,c.g,c.b],i*3);if(!print)uv.setXY(i,.005,.005);else uv.setY(i,.08+uv.getY(i)*.90);}
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(g);
 };
 return {add,box:(size,c,p)=>add(new THREE.BoxGeometry(...size),c,p),cylinder:(r,h,c,p)=>add(new THREE.CylinderGeometry(r,r,h,12),c,p,[0,0,Math.PI/2]),finish:()=>mergeGeometries(pieces)};
}
function labelTexture(spec){
 const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d');
 g.fillStyle='#fff';g.fillRect(0,0,512,256);
 g.fillStyle=spec.family==='cobra'?'#16191c':'#e4d66b';g.fillRect(0,0,512,236);
 g.fillStyle=spec.family==='cobra'?'#f3f3e8':'#222';g.textAlign='center';
 g.font='italic 900 100px sans-serif';g.fillText(spec.family==='cobra'?'KYOSHO':'FUTABA',256,126);
 g.font='600 30px sans-serif';g.fillText(spec.family==='cobra'?'SYNCRO RC SYSTEM':'2.4GHz TELEMETRY RC',256,173,480);
 g.font='700 25px sans-serif';g.fillText(spec.family==='cobra'?'KT-531P':'MINI-Z PRO',256,211);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function controllerParts(id='cobra-plus'){
 if(!HAND_CONTROLLERS[id])id='cobra-plus';if(cache.has(id))return cache.get(id);
 const spec=HAND_CONTROLLERS[id],cobra=spec.family==='cobra',b=geometryBuilder();
 const outline=cobra?
 [[-.015,-.065],[.020,-.062],[.016,-.044],[.006,.007],[.012,.031],[.024,.047],[.022,.079],[.008,.104],[-.092,.104],[-.098,.087],[-.086,.053],[-.069,.036],[-.039,.031],[-.021,.035],[-.010,.021],[-.007,.005]]:
 [[-.015,-.065],[.020,-.062],[.018,-.044],[.008,.006],[.018,.031],[.027,.046],[.020,.081],[.005,.099],[-.083,.099],[-.091,.084],[-.084,.055],[-.069,.037],[-.041,.033],[-.022,.035],[-.011,.019],[-.007,.004]];
 b.add(silhouette(outline,.017,.0025),spec.core);
 for(const side of [-1,1]){
  b.box([.002,.063,.023],cobra?0x55595a:spec.core,[side*.012,-.023,.002]);
  for(let i=0;i<9;i++)b.add(new THREE.BoxGeometry(.0015,.0014,.020),cobra?0x92999b:spec.shell,[side*.0125,-.05+i*.0065,.002],[side*.12,0,0]);
  b.add(new THREE.PlaneGeometry(.037,.018),0xffffff,[side*.0125,.055,-.050],[0,side*Math.PI/2,0],true);
  for(const [z,y]of [[.003,-.052],[.008,.031],[-.027,.076],[-.075,.063],[-.005,.074]]){
   b.cylinder(.0032,.002,metal,[side*.0155,y,z]);b.box([.001,.0007,.0037],dark,[side*.017,y,z]);
  }
 }
 if(cobra){
  b.box([.024,.026,.113],spec.core,[0,.111,-.041]);
  const colors=[0xdb3939,0xf3cf3a,0x289ada,0x37b574];
  for(let i=0;i<4;i++){
   const z=-.085+i*.029;
   for(const side of [-1,1]){
    b.cylinder(.012,.008,dark,[side*.018,.113,z]);
    b.cylinder(id==='cobra-clear'?.0108:.0038,.001,colors[i],[side*.0225,.113,z]);
    b.box([.001,.002,.012],id==='cobra-clear'?dark:colors[i],[side*.0233,.115,z+.003]);
   }
  }
 }
 // RC Steering wheel mounted on the right side of the pistol transmitter (+X)
 b.cylinder(.016,.014,0x1d2024,[.020,.056,-.042]);
 b.cylinder(.025,.016,0x111214,[.030,.056,-.042]);
 b.cylinder(.018,.017,0xd4af37,[.0305,.056,-.042]);
 b.cylinder(.006,.019,0xadb6bc,[.031,.056,-.042]);
 // Top telemetry LCD screen hood
 b.box([.028,.014,.054],0x181b20,[0,.118,-.042]);
 b.box([.022,.003,.044],0x1e88e5,[0,.1255,-.042]);
 // Bottom battery base
 b.box([.030,.018,.052],0x141619,[0,-.072,.004]);
 const triggerBuilder=geometryBuilder();
 const curve=new THREE.CatmullRomCurve3([[0,0,0],[0,-.010,-.008],[0,-.021,-.015],[0,-.039,-.012],[0,-.054,-.022]].map(p=>new THREE.Vector3(...p)));
 triggerBuilder.add(new THREE.TubeGeometry(curve,14,.004,6,false),0x24272a);
 triggerBuilder.box([.012,.018,.005],0x24272a,[0,-.036,-.012]);
 const parts={id,spec,housing:b.finish(),shell:silhouette(outline,.028),trigger:triggerBuilder.finish(),
  material:new THREE.MeshStandardMaterial({vertexColors:true,map:labelTexture(spec),roughness:.48,metalness:.08}),
  shellMaterial:new THREE.MeshStandardMaterial({color:spec.shell,transparent:true,opacity:cobra?.22:.32,roughness:.48,metalness:0,depthWrite:false,side:THREE.FrontSide,forceSinglePass:true})};
 cache.set(id,parts);return parts;
}
