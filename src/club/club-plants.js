import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTex,rng} from './util.js';
// Static indoor dracaenas: curved blades, visible midribs, irregular crowns,
// branched canes, soil inside an open ceramic pot. Shared geometry/materials.
const crowns=[{x:-.035,z:.018,y:.69},{x:.04,z:-.01,y:.90},{x:-.005,z:.025,y:1.10}];
let materials,potGeometry,soilGeometry,canesGeometry;const foliage=new Map();
function leafGeometry(variant){
 if(foliage.has(variant))return foliage.get(variant);
 const parts=[],random=rng(814+variant*101);
 for(const [crown,c] of crowns.entries())for(let leaf=0;leaf<11;leaf++){
  const length=.26+random()*.22,angle=leaf*2.39996+crown*.77+random()*.24,tilt=(random()-.45)*.20;
  const positions=[],colors=[],uv=[],indices=[],breadth=.022+random()*.016;
  for(let i=0;i<=12;i++){
   const t=i/12,width=breadth*Math.sin(Math.PI*t)**.65;
   for(let edge=0;edge<3;edge++){
    const x=(edge-1)*width,z=length*t,y=(.14+tilt)*Math.sin(Math.PI*t)-(.10+leaf%3*.045)*t*t+(edge===1?.006*Math.sin(Math.PI*t):0);
    positions.push(c.x+Math.cos(angle)*x+Math.sin(angle)*z,c.y+y,c.z-Math.sin(angle)*x+Math.cos(angle)*z);
    const shade=.83+random()*.10;colors.push(shade,shade,shade);uv.push(edge/2,t);
   }
  }
  for(let i=0;i<12;i++)for(let edge=0;edge<2;edge++){const a=i*3+edge;indices.push(a,a+3,a+1,a+1,a+3,a+4);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();parts.push(g);
 }
 const result=mergeGeometries(parts);parts.forEach(g=>g.dispose());foliage.set(variant,result);return result;
}
function resources(){
 if(materials)return;
 const leaf=canvasTex(128,512,(g,w,h)=>{const gradient=g.createLinearGradient(0,0,w,0);gradient.addColorStop(0,'#285528');gradient.addColorStop(.46,'#447b39');gradient.addColorStop(.5,'#8ea557');gradient.addColorStop(.54,'#447b39');gradient.addColorStop(1,'#285528');g.fillStyle=gradient;g.fillRect(0,0,w,h);g.strokeStyle='rgba(155,188,104,.18)';g.lineWidth=1;for(let y=18;y<h;y+=14){for(const side of [-1,1]){g.beginPath();g.moveTo(w/2,y);g.quadraticCurveTo(w/2+side*w*.18,y+13,w/2+side*w*.49,y+36);g.stroke();}}},{clamp:true});
 const soil=canvasTex(128,128,(g,w,h)=>{const random=rng(402);g.fillStyle='#30261d';g.fillRect(0,0,w,h);for(let i=0;i<1600;i++){g.fillStyle=['#473a2c','#231c16','#736657'][i%3];g.beginPath();g.ellipse(random()*w,random()*h,.6+random()*1.4,.5+random(),random()*Math.PI,0,Math.PI*2);g.fill();}},{clamp:true});
 materials={pot:new THREE.MeshStandardMaterial({color:0xbfc4bc,roughness:.56}),soil:new THREE.MeshStandardMaterial({map:soil,roughness:1}),canes:new THREE.MeshStandardMaterial({color:0x87765c,roughness:.92}),leaves:new THREE.MeshStandardMaterial({map:leaf,vertexColors:true,side:THREE.DoubleSide,roughness:.67})};
 potGeometry=new THREE.LatheGeometry([[0,0],[.112,0],[.12,.012],[.16,.30],[.162,.315],[.155,.325],[.145,.315],[.144,.30],[.11,.028],[0,.028]].map(([x,y])=>new THREE.Vector2(x,y)),32);
 soilGeometry=new THREE.CylinderGeometry(.141,.141,.018,24);soilGeometry.translate(0,.298,0);
 const pieces=crowns.map(c=>{const h=c.y-.30,g=new THREE.CylinderGeometry(.012,.021,h,10);g.translate(c.x,.30+h/2,c.z);return g;});canesGeometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
}
export function makeClubPlant(variant=0){
 resources();const root=new THREE.Group();root.name='Dracena in vaso';
 for(const [name,geometry,material] of [['Vaso in ceramica con bordo arrotondato',potGeometry,materials.pot],['Terriccio nel vaso',soilGeometry,materials.soil],['Fusti ramificati',canesGeometry,materials.canes],['Foglie arcuate e nervature',leafGeometry(variant%2),materials.leaves]]){
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;mesh.updateMatrix();mesh.matrixAutoUpdate=false;root.add(mesh);
 }
 root.userData.staticDecoration=true;return root;
}
