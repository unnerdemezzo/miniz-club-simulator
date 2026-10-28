import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeCar} from './car.js';
import {DRIVERS,FLOOR,ROOM} from './config.js';
import {canvasTex} from './util.js';
import {benchWorkerGeometry} from './bench-worker.js';

const colours=new Map();
const paint=colour=>{if(!colours.has(colour))colours.set(colour,new T.MeshStandardMaterial({color:colour,roughness:.65}));return colours.get(colour);};
const led=new T.MeshBasicMaterial({color:0xffedc8});
const palette=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.65});
function primitives(root){
 const part=(g,m,x,y,z,name,rotation=[0,0,0])=>{
  const o=new T.Mesh(g,m);o.position.set(x,y,z);o.rotation.set(...rotation);o.name=name;o.castShadow=o.receiveShadow=true;root.add(o);return o;
 };
 return {part,box:(w,h,d,m,x,y,z,n)=>part(new T.BoxGeometry(w,h,d),m,x,y,z,n),
  cylinder:(r,h,m,x,y,z,n,rot)=>part(new T.CylinderGeometry(r,r,h,12),m,x,y,z,n,rot),
  rod:(a,b,r,m,n)=>{const A=new T.Vector3(...a),B=new T.Vector3(...b),o=part(new T.CylinderGeometry(r,r,A.distanceTo(B),10),m,...A.clone().add(B).multiplyScalar(.5).toArray(),n);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),B.sub(A).normalize());return o;}};
}
// Static furniture is batched by material; room detail does not add a draw
// call for every screw/tool/bin. Named anchors retain the scene inventory.
function batch(root,exclude){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),groups=new Map(),meshes=[];
 const painted=new Set(colours.values());
 root.traverse(o=>{if(!o.isMesh||exclude?.includes(o)||o.userData.unbatched)return;meshes.push(o);const material=painted.has(o.material)?palette:o.material;if(!groups.has(material))groups.set(material,[]);groups.get(material).push(o);});
 root.userData.inventory=meshes.map(o=>o.name);
 for(const [material,items] of groups){
  const parts=items.map(o=>{
   const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
   if(material===palette){
    g.deleteAttribute('uv');
    if(!g.attributes.color){const c=o.material.color,values=new Float32Array(g.attributes.position.count*3);for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(values,3));}
   }
   return g;
  });
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  const mesh=new T.Mesh(geometry,material);mesh.name='Dettagli officina raggruppati';mesh.castShadow=mesh.receiveShadow=!material.isMeshBasicMaterial;root.add(mesh);
 }
 for(const o of meshes){const anchor=new T.Group();anchor.name=o.name;anchor.position.copy(o.position);anchor.quaternion.copy(o.quaternion);anchor.scale.copy(o.scale);Object.assign(anchor.userData,o.userData);o.parent.add(anchor);o.removeFromParent();}
}
function label(root,text,w,h,x,y,z,angle=0){
 const map=canvasTex(256,64,(g,W,H)=>{g.fillStyle='#18212b';g.fillRect(0,0,W,H);g.fillStyle='#f5d543';g.font='bold 28px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(text,W/2,H/2,W-12);},{clamp:true});
 const o=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map,roughness:.8}));o.position.set(x,y,z);o.rotation.y=angle;o.name=text;root.add(o);return o;
}
export function buildBenchEquipment(scene,M,{x,y,z,room,car=true,stand=false,rotation=0,supplement=false,worker=null}){
 const root=new T.Group();root.name=`Attrezzatura banco ${room}`;root.position.set(x,y,z);scene.add(root);
 const {part,box,cylinder,rod}=primitives(root),blue=paint(0x275b80),red=paint(0xb52d26),brass=paint(0xc79743),metal=M.metal||M.railProps;
 // Car, small cradle, detached spare wheels and a divided screw tray.
 box(.19,.008,.28,M.blackPlastic||M.molded,-.02,.004,0,'Supporto slot car in manutenzione');
 if(stand){
  // Cavalletto rialzato in alluminio anodizzato per il telaio Kyosho Mini-Z (lascia le ruote sollevate di ~1,2 cm dal tappetino!)
  box(.052,.019,.088,blue,0,.0175,-.02,'Cavalletto setup Mini-Z');
  box(.048,.002,.084,M.rubber||M.blackPlastic,0,.028,-.02,'Gomma antiscivolo cavalletto');
 }
 const excluded=[];
 if(car){const model=makeCar({...DRIVERS[1],base:'#256ca3',num:12});model.root.name='Slot car sul banco';model.root.position.set(-.02,.008,0);model.root.rotation.y=Math.PI/2;root.add(model.root);model.root.traverse(o=>{if(o.isMesh)excluded.push(o);});}
 box(.12,.014,.09,metal,.19,.009,.32,'Vaschetta viti');
 for(let i=0;i<3;i++)box(.003,.014,.08,M.darkMetal,.15+i*.04,.013,.32,'Divisorio vaschetta');
 for(let i=0;i<9;i++)cylinder(.0025,.008,brass,.145+(i%3)*.04,.019,.29+Math.floor(i/3)*.025,'Vite di assetto');
 for(let i=0;i<4;i++)part(new T.TorusGeometry(.015,.005,8,12),M.rubber,-.22+(i%2)*.045,.008,.35+Math.floor(i/2)*.05,'Ruota di ricambio',[Math.PI/2,0,0]);
 // Soldering station with display, heatproof holder, iron and its lead.
 box(.17,.065,.14,blue,.13,.036,-.68,'Stazione saldante');
 label(root,'320 °C',.09,.025,.13,.038,-.608);
 cylinder(.012,.015,M.darkMetal,.19,.03,-.6,'Manopola saldatore',[Math.PI/2,0,0]);
 box(.13,.01,.20,M.darkMetal,-.11,.006,-.68,'Base porta saldatore');
 rod([-.11,.045,-.73],[-.11,.085,-.61],.012,metal,'Supporto saldatore');
 rod([-.11,.035,-.8],[-.11,.065,-.71],.014,M.molded,'Impugnatura saldatore');
 rod([-.11,.065,-.71],[-.11,.105,-.57],.004,metal,'Punta saldatore');
 box(.07,.007,.08,paint(0xd2b468),-.11,.012,-.78,'Spugnetta pulisci punta');
 const cable=new T.CatmullRomCurve3([[-.11,.036,-.80],[-.23,.018,-.85],[-.27,.015,-.61],[.09,.016,-.60]].map(v=>new T.Vector3(...v)));
 part(new T.TubeGeometry(cable,18,.002,5,false),M.darkMetal,0,0,0,'Cavo stazione saldante');
 // Articulated laboratory lamp; emissive diffuser, no additional GPU light.
 cylinder(.065,.018,blue,.22,.009,-.31,'Base lampada da laboratorio');
 rod([.22,.018,-.31],[.20,.28,-.31],.007,metal,'Braccio lampada');
 rod([.20,.28,-.31],[-.03,.42,-.18],.006,metal,'Braccio orientabile lampada');
 for(const p of [[.20,.28,-.31],[-.03,.42,-.18]])part(new T.SphereGeometry(.014,10,8),blue,...p,'Snodo lampada');
 const shade=part(new T.CylinderGeometry(.075,.09,.025,20),blue,-.03,.415,-.18,'Testa lampada',[0,0,.18]);
 cylinder(.07,.003,led,-.03,.398,-.18,'Diffusore luminoso lampada');
 // Fine tools, multimeter, solder spool, tweezers and a small parts box.
 for(let i=0;i<3;i++){rod([-.24+i*.09,.018,.56],[-.24+i*.09,.018,.71],.0025,metal,'Cacciavite di precisione');rod([-.24+i*.09,.018,.71],[-.24+i*.09,.018,.77],.008,i%2?blue:red,'Manico cacciavite');}
 for(const side of [-1,1])rod([.12,.016,.60],[.12+side*.016,.016,.76],.0025,metal,'Pinzetta');
 box(.095,.021,.16,red,.2,.012,.72,'Multimetro');label(root,'12.0 V',.063,.022,.2,.025,.803);
 cylinder(.045,.035,blue,-.22,.019,-.46,'Rocchetto filo stagno');cylinder(.021,.040,metal,-.22,.023,-.46,'Filo per saldatura');
 box(.18,.07,.17,paint(0xaeb7be),-.01,.039,.47,'Alimentatore da laboratorio');
 label(root,'12.00 V / 0.0 A',.14,.026,-.01,.04,.558);
 for(const X of [-.066,.045])cylinder(.007,.012,M.darkMetal,X,.020,.563,'Presa alimentatore',[Math.PI/2,0,0]);
 box(.15,.045,.11,paint(0xc3c6c3),-.12,.024,.92,'Scatola minuteria');label(root,'M2 / M2.5',.13,.025,-.12,.029,.977);
 if(supplement)for(const o of [...root.children])if(!/salda|Spugnetta|Rocchetto|Filo per sald|Vaschetta|Divisorio|Vite di assetto|320/.test(o.name))o.removeFromParent();
 if(worker){
  const floor=worker.y??FLOOR-y;
  const person=part(benchWorkerGeometry,palette,worker.x,floor,worker.z,`Socio seduto di spalle · ${room}`,[0,worker.rotation,0]);
  person.userData.staticBenchWorker=true;root.userData.benchWorker=person.name;
  if(worker.stool!==false){
   cylinder(.17,.04,M.blackPlastic||M.molded,worker.x,floor+.615,worker.z,'Seduta socio al banco');
   cylinder(.024,.60,metal,worker.x,floor+.30,worker.z,'Piantana seduta socio');
   cylinder(.22,.018,M.darkMetal,worker.x,floor+.009,worker.z,'Base seduta socio');
  }
 }
 batch(root,excluded);root.rotation.y=rotation;return root;
}

export function stockWallShelves(scene,M,details,{x,z,y,length,room,side=1,rows=3}){
 const root=new T.Group();root.name=`Ricambi sulle mensole ${room}`;root.position.set(x,y,z);scene.add(root);
 const {box,part,cylinder}=primitives(root),metal=M.metal||M.railProps;
 for(let row=0;row<rows;row++){
  const level=row*.33;
  for(let i=0;i<Math.floor(length/.38);i++){
   const Z=-length/2+.21+i*.38,colour=paint([0x236397,0xaaaead,0xa6372d,0x30443b][(i+row)%4]);
   box(.23,.115,.31,colour,0,level+.061,Z,'Scatola ricambi slot');
   const p=part(new T.PlaneGeometry(.27,.065),new T.MeshStandardMaterial({map:details.boxLabels[(i+row)%details.boxLabels.length],roughness:.7}),side*.117,level+.070,Z,'Etichetta scatola ricambi',[0,side*Math.PI/2,0]);p.castShadow=false;
  }
  box(.035,.003,length-.1,paint(0xf2c830),side*.16,level+.01,0,'Etichetta bordo ripiano');
 }
 // Visible stock on the shelf ends: tyre rack and transparent part drawers.
 for(let j=0;j<4;j++)part(new T.TorusGeometry(.016,.006,8,12),M.rubber,side*.16,.33+.017,-length/2+.04+j*.025,'Pneumatico a magazzino',[Math.PI/2,0,0]);
 batch(root);return root;
}

export function buildClubAmenities(scene,M,room){
 const root=new T.Group();root.name=`Arredi di servizio ${room}`;root.position.set(7.9,FLOOR,ROOM.z0+.38);scene.add(root);
 const {box,cylinder,part}=primitives(root),grey=paint(0x5e6e7b),blue=paint(0x275b80),red=paint(0xb52d26),metal=M.metal||M.railProps;
 box(1.4,1.35,.46,grey,0,.715,0,'Armadio ricambi');
 for(const X of [-.34,.34]){box(.67,1.27,.016,paint(0xbcc3c6),X,.73,.238,'Anta armadio');box(.018,.17,.025,M.darkMetal,X+(X<0?.24:-.24),.77,.264,'Maniglia armadio');}
 for(const X of [-.55,.55])for(const Z of [-.15,.15])box(.04,.055,.04,M.darkMetal,X,.0275,Z,'Piedino armadio');
 label(root,`${room.toUpperCase()} · RICAMBI`,1.17,.08,0,1.30,.249);
 box(.39,.09,.28,blue,-.28,1.44,0,'Valigetta pulsanti');box(.17,.035,.016,M.darkMetal,-.28,1.502,0,'Maniglia valigetta');
 box(.30,.10,.25,red,.27,1.445,0,'Kit riparazione');

 // Extinguisher with gauge, bracket, hose and clear safety label.
 cylinder(.07,.38,red,-1.02,.40,0,'Estintore');cylinder(.026,.055,metal,-1.02,.62,0,'Valvola estintore');
 box(.11,.025,.035,M.darkMetal,-1.02,.665,0,'Leva estintore');part(new T.SphereGeometry(.02,8,6),M.white,-1.02,.64,.04,'Manometro estintore');
 const hose=new T.CatmullRomCurve3([[-.98,.65,0],[-.89,.61,0],[-.89,.31,0],[-.94,.24,0]].map(v=>new T.Vector3(...v)));
 part(new T.TubeGeometry(hose,12,.006,6,false),M.darkMetal,0,0,0,'Tubo estintore');label(root,'ESTINTORE',.25,.10,-1.02,.93,-.132);
 cylinder(.18,.42,grey,1.16,.21,.07,'Cestino raccolta');cylinder(.19,.04,blue,1.16,.44,.07,'Coperchio cestino');
 label(root,'PLASTICA',.23,.065,1.16,.28,.253);
 batch(root);return root;
}
