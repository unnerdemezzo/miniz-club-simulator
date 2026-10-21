import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ROOM,FLOOR} from './config.js';
import {ROOM_LINK} from './club-tracks.js';
import {TRACK_GEOMETRIES} from './track.js';
import {canvasTex} from './util.js';

// Opaque, static detail: one coloured mesh per doorway, two for the entire
// wood-room exhibition. No glass, extra lights, actors or per-frame updates.
const paint=new T.MeshStandardMaterial({vertexColors:true,roughness:.66,metalness:.12});
function pieces(){
 const geometries=[];
 const part=(geometry,colour,x,y,z,rotation)=>{
  const g=geometry.index?geometry.toNonIndexed():geometry;
  if(g!==geometry)geometry.dispose();g.deleteAttribute('uv');
  if(rotation)g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)));
  g.translate(x,y,z);
  const c=new T.Color(colour),values=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<values.length;i+=3)values.set(c.toArray(),i);
  g.setAttribute('color',new T.BufferAttribute(values,3));geometries.push(g);
 };
 return {
  part,
  box:(w,h,d,c,x,y,z)=>part(new T.BoxGeometry(w,h,d),c,x,y,z),
  rod:(a,b,r,c)=>{
   const A=new T.Vector3(...a),B=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,A.distanceTo(B),8);
   g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),B.clone().sub(A).normalize()));
   part(g,c,...A.add(B).multiplyScalar(.5).toArray());
  },
  finish:()=>{const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());return geometry;}
 };
}
let doorGeometry;
function closedDoorGeometry(){
 if(doorGeometry)return doorGeometry;
 const p=pieces(),w=ROOM_LINK.z1-ROOM_LINK.z0,h=ROOM_LINK.height,clear=w-.16,leaf=(clear-.006)/2;
 // The complete door belongs to this side of the shared wall, including its
 // backing. Opposite rooms use a mirrored copy without coplanar surfaces.
 p.box(w,h,.012,0x74736b,0,h/2,.012);
 for(const side of [-1,1]){
  const x=side*(leaf/2+.003);
  p.box(leaf,h-.095,.044,0xc7b394,x,(h-.095)/2+.01,.046);
  // Shallow framed upper/lower panels read as two doors even from the podium.
  for(const [y,ph] of [[.53,.74],[1.70,1.34]]){
   p.box(leaf-.16,ph,.009,0x9e896a,x,y,.072);
   p.box(leaf-.185,ph-.026,.012,0xdecfb5,x,y,.083);
  }
  p.box(leaf-.10,.16,.008,0xb1b8bb,x,.12,.075);
  const handle=side*.13;
  for(const y of [1.00,1.17])p.rod([handle,y,.073],[handle,y,.122],.012,0xb5bcc0);
  p.rod([handle,1.00,.122],[handle,1.17,.122],.015,0xd2d8da);
  for(const y of [.40,1.22,2.12])p.rod([side*(w/2-.085),y-.04,.077],[side*(w/2-.085),y+.04,.077],.014,0xadb4b7);
 }
 for(const side of [-1,1])p.box(.08,h,.10,0xe8e4db,side*(w/2-.04),h/2,.065);
 p.box(w,.085,.10,0xe8e4db,0,h-.0425,.065);
 p.box(w,.012,.14,0xb4bbbf,0,.006,.077);
 doorGeometry=p.finish();return doorGeometry;
}
export function buildClosedRoomDoor(scene,{x,angle,to}){
 const root=new T.Group();root.name=`Doppia porta chiusa verso ${to}`;
 root.position.set(x,FLOOR,(ROOM_LINK.z0+ROOM_LINK.z1)/2);root.rotation.y=angle;
 Object.assign(root.userData,{closed:true,leaves:2,staticRoomDoor:true,to});
 const mesh=new T.Mesh(closedDoorGeometry(),paint);mesh.name='Ante, telaio, soglia e maniglie della doppia porta';
 mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);scene.add(root);return root;
}

let woodPrintMaterial;
function woodPrints(){
 if(woodPrintMaterial)return woodPrintMaterial;
 const map=canvasTex(1024,1024,(g,w,h)=>{
  // A narrow museum label, a workshop pegboard, and the actual four-lane
  // course diagram share one atlas rather than three additional materials.
  g.fillStyle='#ece5d7';g.fillRect(0,0,w,128);
  g.fillStyle='#5d4934';g.font='700 37px Arial';g.fillText('PISTA FRESATA',36,50);
  g.font='27px Arial';g.fillText('LEGNO · SLOT · TRECCIA IN RAME',36,96);
  g.fillStyle='#c9cdd0';g.fillRect(0,128,w,384);
  g.fillStyle='#555f65';
  for(let y=233;y<500;y+=22)for(let x=25;x<w;x+=25){g.beginPath();g.arc(x,y,2.6,0,Math.PI*2);g.fill();}
  g.fillStyle='#293c47';g.fillRect(0,128,w,86);
  g.fillStyle='#f4ede0';g.font='700 34px Arial';g.fillText('OFFICINA · ASSETTO & MANUTENZIONE',28,184);
  g.fillStyle='#203c4a';g.fillRect(0,512,w,512);
  g.strokeStyle='rgba(200,224,229,.09)';g.lineWidth=1;
  for(let x=0;x<w;x+=32){g.beginPath();g.moveTo(x,512);g.lineTo(x,h);g.stroke();}
  for(let y=512;y<h;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  g.fillStyle='#f3e7c6';g.font='700 34px Arial';g.fillText('IL CIRCUITO DEL CLUB',34,570);
  const lanes=TRACK_GEOMETRIES.wood.lanes,all=lanes.flatMap(l=>l.pts);
  const x0=Math.min(...all.map(p=>p.x)),x1=Math.max(...all.map(p=>p.x)),y0=Math.min(...all.map(p=>p.y)),y1=Math.max(...all.map(p=>p.y));
  const scale=Math.min(930/(x1-x0),320/(y1-y0));
  const ox=(w-(x1-x0)*scale)/2,oy=608+(320-(y1-y0)*scale)/2;
  for(const [i,lane] of lanes.entries()){
   g.strokeStyle=['#ee6b60','#f1eee2','#70bba1','#84afec'][i];g.lineWidth=2.3;g.beginPath();
   lane.pts.forEach((p,j)=>g[j?'lineTo':'moveTo'](ox+(p.x-x0)*scale,oy+(p.y-y0)*scale));g.closePath();g.stroke();
  }
  g.fillStyle='#c9dce0';g.font='25px Arial';g.fillText('SALA MINI-Z · SCALA 1:27 · TELEMETRIA 2.4GHz',34,986);
 },{clamp:true});
 woodPrintMaterial=new T.MeshStandardMaterial({map,roughness:.88});return woodPrintMaterial;
}
export function buildWoodWorkshopWall(scene){
 const root=new T.Group();root.name='Parete laboratorio e circuito sala legno';
 root.position.set(ROOM.x0+.008,FLOOR,0);root.rotation.y=Math.PI/2;scene.add(root);
 const p=pieces(),prints=[];
 const print=(w,h,x,y,z,top,bottom)=>{
  const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setY(i,1-bottom/1024+uv.getY(i)*(bottom-top)/1024);
  g.translate(x,y,z);prints.push(g);
 };
 // A full-size 1.85 m sample of the wood circuit: four slots at its actual
 // 110 mm spacing, with paired copper conductors beside each slot.
 p.box(2.05,1.03,.026,0x667078,5.4,2.20,.025);
 p.box(1.91,.63,.025,0x9c7c56,5.4,2.12,.051);
 p.box(1.85,.57,.012,0xc8a57b,5.4,2.12,.075);
 for(let i=0;i<4;i++){
  const y=2.12+(i-1.5)*.11;
  p.box(1.78,.005,.003,0x393028,5.4,y,.0825);
  for(const side of [-1,1])p.box(1.78,.014,.004,0xb8794b,5.4,y+side*.028,.085);
 }
 print(1.88,.20,5.4,2.59,.042,0,128);
 // A wall tool board, above the existing benches and seated worker. Tools
 // have proper handles and hang in deliberate groups rather than floating.
 p.box(1.92,1.02,.030,0x4e5e69,2.6,2.21,.027);
 print(1.84,.94,2.6,2.21,.045,128,512);
 for(const [i,x] of [2.02,2.29,2.58].entries()){
  p.rod([x,1.95,.074],[x,2.22,.074],.011,0xbac3c6);
  p.rod([x,2.22,.074],[x,2.40,.074],.025,[0xbb4a3c,0x34698c,0xd19c39][i]);
  p.rod([x,2.415,.051],[x,2.415,.085],.007,0xc7cdd0);
 }
 for(const x of [2.93,3.19]){
  p.box(.042,.28,.018,0xbdc5c8,x,2.16,.079);
  for(const s of [-1,1])p.box(.025,.095,.018,0xbdc5c8,x+s*.026,2.33,.079);
  p.rod([x,2.38,.051],[x,2.38,.085],.006,0xbac3c6);
 }
 p.box(.36,.09,.14,0x8f9d9f,3.14,1.83,.113);
 for(let i=0;i<3;i++)p.box(.004,.08,.12,0x586873,3.025+i*.115,1.84,.124);
 // The third frame is an accurate diagram of this room's course, not a
 // duplicate trophy shelf or another workshop row.
 p.box(2.07,1.10,.030,0xb6956b,-.13,2.22,.027);
 print(1.98,1.01,-.13,2.22,.048,512,1024);
 const mesh=new T.Mesh(p.finish(),paint);mesh.name='Campione pista e attrezzi murali raggruppati';mesh.receiveShadow=true;root.add(mesh);
 const geometry=mergeGeometries(prints);prints.forEach(g=>g.dispose());
 const labels=new T.Mesh(geometry,woodPrints());labels.name='Pannello officina e disegno reale circuito legno';root.add(labels);
 root.userData.staticWoodWall=true;return root;
}
