import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export function makeWaterCooler(){
  const root=new THREE.Group();root.name='Distributore acqua';
  const shell=new THREE.MeshStandardMaterial({color:0xe4e5e3,roughness:.46});
  const dark=new THREE.MeshStandardMaterial({color:0x272c32,roughness:.6});
  const plastic=new THREE.MeshPhysicalMaterial({color:0x9cc9df,roughness:.19,clearcoat:.7,clearcoatRoughness:.12,transparent:true,opacity:.58,depthWrite:false});
  const add=(geo,mat,x,y,z,name)=>{const m=new THREE.Mesh(geo,mat);m.name=name||'';m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);return m;};
  add(new RoundedBoxGeometry(.36,.94,.34,3,.025),shell,0,.49,0,'Corpo distributore');
  add(new RoundedBoxGeometry(.37,.05,.35,2,.012),dark,0,.035,0,'Base sul pavimento');
  add(new RoundedBoxGeometry(.26,.29,.018,2,.008),dark,0,.73,.171,'Vano rubinetti');
  add(new RoundedBoxGeometry(.28,.035,.12,2,.01),dark,0,.565,.205,'Vaschetta raccogligocce');
  for(let i=0;i<7;i++) add(new THREE.BoxGeometry(.003,.003,.088),shell,-.105+i*.035,.585,.205);
  for(const side of [-1,1]){
    const color=new THREE.MeshStandardMaterial({color:side<0?0x226296:0xb9463c,roughness:.5});
    add(new THREE.CylinderGeometry(.014,.018,.034,16),dark,side*.065,.78,.197).rotation.x=Math.PI/2;
    add(new RoundedBoxGeometry(.026,.008,.032,2,.003),color,side*.065,.805,.211,'Leva rubinetto');
    add(new THREE.CylinderGeometry(.007,.007,.025,12),dark,side*.065,.761,.214,'Beccuccio');
  }
  for(let i=0;i<5;i++) add(new THREE.BoxGeometry(.22,.003,.004),dark,0,.25+i*.026,.171,'Griglia ventilazione');
  add(new THREE.CylinderGeometry(.074,.084,.038,32),dark,0,.979,0,'Alloggiamento bottiglia');
  add(new THREE.CylinderGeometry(.035,.04,.04,32),new THREE.MeshStandardMaterial({color:0x244d78,roughness:.38}),0,1.006,0,'Tappo e collo');
  const profile=[[0,1.02],[.038,1.02],[.04,1.055],[.073,1.08],[.116,1.113],[.14,1.15],[.142,1.19],[.142,1.34],[.14,1.38],[.125,1.41],[.08,1.426],[0,1.43]];
  add(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),48),plastic,0,0,0,'Boccione sagomato');
  const water=new THREE.MeshStandardMaterial({color:0x80b8d0,roughness:.3,transparent:true,opacity:.23,depthWrite:false});
  add(new THREE.CylinderGeometry(.131,.10,.22,40),water,0,1.22,0,'Livello acqua');
  for(const y of [1.17,1.21,1.32,1.365])add(new THREE.TorusGeometry(.142,.003,6,48),plastic,0,y,0,'Nervatura bottiglia').rotation.x=Math.PI/2;
  return root;
}
