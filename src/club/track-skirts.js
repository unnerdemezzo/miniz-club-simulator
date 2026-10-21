import * as T from 'three';
import {FLOOR} from './config.js';
import {posterTexture} from './slot-brand-posters.js';
import {MAX_ANISO} from './util.js';
// Original manufacturer artwork and photographed track skirts: docs/track-skirts.md.
export const SKIRT_BRANDS={ninco:{logo:'ninco',colour:'#090909'},protrack:{logo:'scaleauto-horizontal',colour:'#111214',checks:false},wood:{logo:'nsr',colour:'#f4f2eb'},rally:{logo:'ninco',colour:'#090909'}};
SKIRT_BRANDS.policar={logo:'policar-user',secondaryLogo:'slotit-user',colour:'#e8e7e2'};
SKIRT_BRANDS.rallycross={...SKIRT_BRANDS.protrack};
SKIRT_BRANDS.oxigen={logo:'policar-user',secondaryLogo:'slotit-user',thirdLogo:'oxigen-user',colour:'#ffffff'};
SKIRT_BRANDS.oxigen16=SKIRT_BRANDS.oxigen;
SKIRT_BRANDS.policarmb={...SKIRT_BRANDS.policar};
SKIRT_BRANDS.carrera={logo:'carrera',colour:'#c91924'};
SKIRT_BRANDS.scaleauto8={...SKIRT_BRANDS.protrack};
const maps=new Map();
function printTexture(id,loader){
 if(maps.has(id))return maps.get(id);
 const spec=SKIRT_BRANDS[id],promise=Promise.all([posterTexture(loader,spec.logo),spec.secondaryLogo?posterTexture(loader,spec.secondaryLogo):Promise.resolve(null),spec.thirdLogo?posterTexture(loader,spec.thirdLogo):Promise.resolve(null)]).then(([source,secondary,third])=>{
  const c=document.createElement('canvas');c.width=1024;c.height=384;const g=c.getContext('2d');
  g.fillStyle=spec.colour;g.fillRect(0,0,1024,384);
  if(spec.checks){for(let y=0;y<2;y++)for(let x=0;x<32;x++){g.fillStyle=(x+y)%2?'#f3f2ed':'#202124';g.fillRect(x*32,y*32,32,32);g.fillRect(x*32,320+y*32,32,32);}}
  const img=source.image,ratio=img.width/img.height,w=Math.min(750,220*ratio),h=w/ratio;
  if(third){
   for(const [i,texture]of [source,secondary,third].entries()){const image=texture.image,r=image.width/image.height,w=Math.min(i===2?410:370,100*r),h=w/r;g.drawImage(image,i===2?(1024-w)/2:i===0?65:1024-w-65,i===2?230:70,w,h);}
  }else if(secondary){
   const primaryW=700,primaryH=primaryW/ratio;g.drawImage(img,(1024-primaryW)/2,30,primaryW,primaryH);
   const second=secondary.image,secondRatio=second.width/second.height,secondW=260,secondH=secondW/secondRatio;g.drawImage(second,(1024-secondW)/2,384-secondH-22,secondW,secondH);
  }else g.drawImage(img,(1024-w)/2,spec.label?190:(384-h)/2,w,spec.label?h*.55:h);
  if(spec.label){g.fillStyle='#fff';g.font='900 100px Arial';g.textAlign='center';g.fillText(spec.label,512,155);}
  // Thread-sized weave and stitched hems stay subordinate to the actual logo.
  g.strokeStyle='rgba(0,0,0,.04)';g.lineWidth=1;
  for(let x=0;x<1024;x+=3){g.beginPath();g.moveTo(x,0);g.lineTo(x,384);g.stroke();}
  g.strokeStyle='rgba(255,255,255,.08)';for(let y=0;y<384;y+=3){g.beginPath();g.moveTo(0,y);g.lineTo(1024,y);g.stroke();}
  g.setLineDash([3,5]);g.strokeStyle=id==='ninco'?'#444':'rgba(0,0,0,.25)';
  for(const y of [9,15,369,375]){g.beginPath();g.moveTo(0,y);g.lineTo(1024,y);g.stroke();}
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=T.RepeatWrapping;map.anisotropy=MAX_ANISO;return map;
 }).catch(error=>{maps.delete(id);throw error;});maps.set(id,promise);return promise;
}
export function buildTrackSkirt(scene,outline,id,loader,{top=-.001,bottom=FLOOR+.07,offset=.0012,inward=false,rows=12,closed=true,taut=false}={}){
 const root=new T.Group();root.name=`Telo ${id} in tessuto`;root.userData.brand=SKIRT_BRANDS[id].logo;scene.add(root);
 let area=outline.reduce((a,p,i)=>{const q=outline[(i+1)%outline.length];return a+p.x*q.z-q.x*p.z;},0);
 if(closed&&(area>0)!==inward)outline=[...outline].reverse();
 const vertices=closed?outline:outline.slice(0,-1);
 const lengths=vertices.map((p,i)=>p.distance??Math.hypot(outline[(i+1)%outline.length].x-p.x,outline[(i+1)%outline.length].z-p.z));
 const total=lengths.reduce((a,b)=>a+b,0),positions=[],uv=[],indices=[];
 const normals=vertices.map((p,i)=>{const q=outline[(i+1)%outline.length],length=lengths[i];return {x:-(q.z-p.z)/length,z:(q.x-p.x)/length};});
 const corners=normals.map((n,i)=>{const previous=!closed&&i===0?n:normals[(i+normals.length-1)%normals.length],x=n.x+previous.x,z=n.z+previous.z,d=n.x*x+n.z*z;return d>.2?{x:x/d,z:z/d}:n;});
 if(!closed)corners.push(normals.at(-1));
 const edge=s=>{
  let index=0,walk=s;while(index<lengths.length-1&&walk>lengths[index])walk-=lengths[index++];
  const a=outline[index],b=outline[(index+1)%outline.length],length=lengths[index],t=Math.min(1,walk/length),normal=normals[index],blend=Math.min(.08,length/2);
  let nx=normal.x,nz=normal.z;
  const corner=walk<blend?corners[index]:walk>length-blend?corners[(index+1)%outline.length]:null;
  if(corner){const w=1-Math.min(walk,length-walk)/blend;nx+=(corner.x-nx)*w;nz+=(corner.z-nz)*w;}
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,nx,nz,y:Number.isFinite(a.y)&&Number.isFinite(b.y)?a.y+(b.y-a.y)*t:undefined};
 };
 const surface=(s,v)=>{
  const p=edge(s),phase=s/total*Math.round(total/.46)*Math.PI*2;
  // Taut fixing at the actual fascia; shallow outward-only folds cannot
  // intersect the frame or open an air gap along the upper seam.
  // A taut skirt (stretched and clipped at the hem) has no folds at all.
  const folds=taut?0:.004*(.5+.5*Math.sin(phase+v*.45))*Math.sin(Math.PI*v*.5)**2;
  const depth=offset+folds,upper=p.y??(typeof top==='function'?top(p.x,p.z):top);
  return new T.Vector3(p.x+p.nx*depth,upper+(bottom-upper)*v+(taut?0:.001*Math.sin(phase)*v*v),p.z+p.nz*depth);
 };
 const distances=[0];let walked=0;
 for(const length of lengths){const steps=Math.max(1,Math.ceil(length/.035));for(let i=1;i<=steps;i++)distances.push(walked+length*i/steps);walked+=length;}
 const columns=distances.length-1;
 for(let i=0;i<=columns;i++)for(let j=0;j<=rows;j++){const s=distances[i],v=j/rows,p=surface(s,v);positions.push(p.x,p.y,p.z);uv.push(s/2.4,1-v);}
 // Face the visible side of the fabric. GTAO's normal/depth pass uses a
 // front-sided override material, even when the colour material is double-sided.
 for(let i=0;i<columns;i++)for(let j=0;j<rows;j++){const a=i*(rows+1)+j,b=a+rows+1;indices.push(a,a+1,b,a+1,b+1,b);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new T.MeshStandardMaterial({color:SKIRT_BRANDS[id].colour,roughness:1,metalness:0,side:T.DoubleSide});
 const cloth=new T.Mesh(geometry,material);cloth.name=taut?'Tessuto teso con orlo cucito':'Tessuto con pieghe e orlo cucito';
 // A double-sided, zero-thickness curtain 1 mm below the deck cannot make
 // a stable silhouette in the room's centimetre-scale shadow map. The solid
 // table casts the room shadow; the fabric still receives light and shadows.
 cloth.castShadow=false;cloth.receiveShadow=true;root.add(cloth);
 const clips=Math.floor(total/.46),eyelets=new T.InstancedMesh(new T.TorusGeometry(.008,.0018,5,10),new T.MeshStandardMaterial({color:0x6c6c69,metalness:.7,roughness:.5}),clips);
 const matrix=new T.Matrix4(),rotation=new T.Quaternion();
 for(let i=0;i<clips;i++){const s=i/clips*total,p=edge(s),position=surface(s,.015);position.x+=p.nx*.002;position.z+=p.nz*.002;rotation.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(p.nx,0,p.nz).normalize());matrix.compose(position,rotation,new T.Vector3(1,1,1));eyelets.setMatrixAt(i,matrix);}
 eyelets.name='Occhielli di fissaggio telo';root.add(eyelets);
 root.userData.ready=printTexture(id,loader).then(map=>{material.map=map;material.color.set(0xffffff);material.needsUpdate=true;root.userData.logoLoaded=true;return true;}).catch(error=>{root.userData.loadError=error.message;return false;});
 return root;
}

