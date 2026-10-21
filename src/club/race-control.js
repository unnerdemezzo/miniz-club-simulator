import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FLOOR,ROOM,VERSION} from './config.js';
import {canvasTex} from './util.js';
import {makeRealisticPilot} from './realistic-pilot.js';
import {posterTexture} from './slot-brand-posters.js';

// Metres, on the wall opposite the driving podium. The desk faces the
// drivers; the director stands behind it, looking into the room.
export const RACE_CONTROL_PLACES={policarmb:3,carrera:-1.6,wood:2.45,ninco:2.8,protrack:4,scaleauto8:2.5,policar:4,rallycross:2.67,rally:.88,oxigen:-1.6,
 // oXigen 16: on the right-hand short side, facing the table (2.30.112).
 oxigen16:{x:ROOM.x1-1.16,z:-2.24,rotation:-Math.PI/2}};
export const RACE_CONTROL_SPONSORS=Object.freeze({policarmb:'slotit',carrera:'nsr',wood:'slotit',ninco:'nsr',protrack:'slotit',scaleauto8:'scaleauto',policar:'slotit',rallycross:'nsr',rally:'nsr',oxigen:'slotit',oxigen16:'slotit'});
// Colours and logos from the two reference images supplied by the user.
const CONSOLE_BRANDS={
 scaleauto:{id:'scaleauto',name:'Scaleauto',base:0x263a4b,accent:0xf1cb3d},
 slotit:{id:'slotit',name:'Slot.it',base:0xff4816,accent:0xf9e548},
 nsr:{id:'nsr',name:'NSR',base:0xee1d23,accent:0xffffff}
};
const consoleTextures=new Map();
function consoleTexture(loader=new T.TextureLoader(),id){
 if(id==='scaleauto')return posterTexture(loader,'scaleauto-horizontal');
 if(!consoleTextures.has(id))consoleTextures.set(id,loader.loadAsync(`assets/slot-brands/console-${id}.jpg?v=${VERSION}`).then(map=>{map.colorSpace=T.SRGBColorSpace;return map;}).catch(error=>{consoleTextures.delete(id);throw error;}));
 return consoleTextures.get(id);
}
export const RACE_DIRECTORS={
 policarmb:{id:'director-championship',model:'guest-marta',name:'Elisa',room:'POLICAR CHAMPIONS',height:1.70,faceWidth:1.01},
 carrera:{id:'director-carrera',model:'ninco-paolo',name:'Carlo',room:'CARRERA DIGITAL 124',height:1.78,faceWidth:1.02},
 oxigen:{id:"director-oxigen",model:"ninco-enrico",name:"Andrea",room:"OXIGEN",height:1.76,faceWidth:1.01},
 oxigen16:{id:"director-oxigen16",model:"ninco-paolo",name:"Roberto",room:"OXIGEN 16 PILOTI",height:1.78,faceWidth:1.02},
 policar:{id:'director-marta',model:'guest-alice',name:'Marta',room:'POLICAR',height:1.68,faceWidth:1.01},
 rallycross:{id:'director-luca',model:'ninco-davide',name:'Luca',room:'RALLYCROSS',height:1.79,faceWidth:1.01},
 wood:{id:'director-sergio',model:'ninco-davide',name:'Sergio',room:'LEGNO',height:1.80,faceWidth:1.04},
 ninco:{id:'director-nadia',model:'guest-alice',name:'Nadia',room:'NINCO',height:1.66,faceWidth:.97},
 protrack:{id:'director-vittorio',model:'ninco-enrico',name:'Vittorio',room:'SCALEAUTO',height:1.73,faceWidth:1.03},
 scaleauto8:{id:'director-scaleauto8-laura',model:'guest-alice',name:'Laura',room:'SCALEAUTO 8 CORSIE',height:1.69,faceWidth:.98},
 rally:{id:'director-omar',model:'cropped',name:'Omar',room:'RALLY NINCO',height:1.82,faceWidth:1.02}
};

// Batch static parts by material; screens and signal lamps stay dynamic.
function batchStatic(root){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),groups=new Map();
 root.traverse(o=>{if(!o.isMesh||o.userData.dynamic)return;const key=o.material;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});
 for(const [material,parts] of groups){
  const geometries=parts.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));return g;});
  const merged=new T.Mesh(mergeGeometries(geometries),material);merged.name=parts.map(o=>o.name).filter(Boolean).join(' / ');merged.castShadow=merged.receiveShadow=!material.isMeshBasicMaterial;root.add(merged);
  geometries.forEach(g=>g.dispose());parts.forEach(o=>{o.removeFromParent();});
 }
}
function directorPerson(cast){
 // Use the same textured, skinned character system as the club's people.
 // These four meshes are distinct and not already in their own room roster.
 // If an optional asset fails, retry it instead of showing a mannequin.
 const person=makeRealisticPilot({...cast,label:`Direttore di gara · ${cast.name}`,pose:'stand',fallback:false});
 return person;
}

export function buildRaceControl(scene,M,trackId,monitor,details,loader){
 const cast=RACE_DIRECTORS[trackId];if(!cast)throw new Error('Sala direzione gara sconosciuta');
 const sponsor=CONSOLE_BRANDS[RACE_CONTROL_SPONSORS[trackId]];
 const root=new T.Group();root.name=`Console direzione gara ${sponsor.name} · ${cast.room}`;root.userData.sponsor=sponsor.id;const place=RACE_CONTROL_PLACES[trackId];if(typeof place==='object'){root.position.set(place.x,FLOOR,place.z);root.rotation.y=place.rotation;}else root.position.set(place,FLOOR,ROOM.z0+1.16);scene.add(root);
 const white=new T.MeshStandardMaterial({color:sponsor.base,roughness:.46}),accent=new T.MeshStandardMaterial({color:sponsor.accent,roughness:.5}),dark=new T.MeshStandardMaterial({color:0x222d37,roughness:.48,metalness:.3});
 const part=(geo,mat,x,y,z,name,angle=0)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.y=angle;m.name=name;m.castShadow=m.receiveShadow=!mat.isMeshBasicMaterial;root.add(m);return m;};
 const box=(w,h,d,mat,x,y,z,name)=>part(new T.BoxGeometry(w,h,d),mat,x,y,z,name);
 const plane=(w,h,mat,x,y,z,name,angle=0)=>part(new T.PlaneGeometry(w,h),mat,x,y,z,name,angle);
 const label=(text,w,h,x,y,z,angle=0)=>{const map=canvasTex(1024,128,(g,W,H)=>{g.fillStyle='#202a35';g.fillRect(0,0,W,H);g.fillStyle='#f4f2ec';g.textAlign='center';g.textBaseline='middle';g.font='bold 54px sans-serif';g.fillText(text,W/2,H/2,W-36);},{clamp:true});return plane(w,h,new T.MeshStandardMaterial({map,roughness:.65}),x,y,z,text,angle);};
 box(2.05,.055,.86,dark,0,.9475,0,'Piano console bordato');
 if(trackId==='scaleauto8'){
  root.userData.consoleStyle='scaleauto8-lateral-bench';
  const timber=new T.MeshStandardMaterial({color:0x80715d,roughness:.8});
  box(.60,.055,.72,timber,1.32,.9475,-.05,'Banco laterale direzione Scaleauto 8');
  for(const z of [-.33,.24]){box(.045,.91,.045,dark,1.56,.465,z,'Gamba banco laterale');box(.12,.035,.12,dark,1.56,.0175,z,'Piedino banco laterale');}
  box(.24,.018,.32,M.white,1.31,.984,-.05,'Registro controlli tecnici');
  const rules=canvasTex(256,256,(g,W,H)=>{g.fillStyle='#eee9df';g.fillRect(0,0,W,H);g.fillStyle='#283b4b';g.font='bold 21px sans-serif';g.fillText('VERIFICHE TECNICHE',12,34);g.lineWidth=2;g.strokeStyle='#74828a';for(let i=0;i<7;i++){const y=65+i*24;g.strokeRect(15,y,12,12);g.beginPath();g.moveTo(38,y+6);g.lineTo(W-15,y+6);g.stroke();}},{clamp:true});
  const paper=plane(.22,.29,new T.MeshStandardMaterial({map:rules,roughness:1}),1.31,.994,-.05,'Scheda controllo regolamenti');paper.rotation.x=-Math.PI/2;
  box(.055,.075,.055,dark,1.49,1.012,-.16,'Portapenne');
  part(new T.CylinderGeometry(.003,.003,.10,6),accent,1.49,1.077,-.16,'Penna controlli');
 }

 for(const x of [-.93,.93]){box(.06,.91,.76,dark,x,.465,0,'Supporto laterale');box(.16,.035,.80,dark,x,.0175,0,'Piede a pavimento');box(.012,.77,.74,white,x+(x<0?-.037:.037),.50,0,'Adesivo laterale bianco');box(.015,.10,.75,accent,x+(x<0?-.045:.045),.205,0,`Fascia laterale ${sponsor.name}`);}
 box(1.89,.77,.045,white,0,.50,.365,'Rivestimento adesivo frontale');
 box(1.90,.105,.048,accent,0,.205,.366,`Fascia frontale ${sponsor.name}`);
 label('DIREZIONE GARA',1.44,.14,0,.82,.394);
 label(`${cast.name.toUpperCase()} · ${cast.room}`,1.42,.105,0,.305,.394);
 // Original artwork from the user's references, cached once per brand. The
 // planes sit 9 mm clear of the fascia (never coplanar with the wrap).
 const decals=[];
 for(const [w,h,x,y,z,a]of[[1.10,.29,0,.565,.397,0],[.45,.14,-.980,.57,0,-Math.PI/2],[.45,.14,.980,.57,0,Math.PI/2]]){
  const mat=new T.MeshStandardMaterial({color:0xffffff,transparent:true,depthWrite:false,roughness:.6});
  const decal=plane(w,h,mat,x,y,z,`Adesivo ${sponsor.name}`,a);decal.visible=false;decal.castShadow=decal.receiveShadow=false;decal.userData.dynamic=true;decals.push(decal);
 }
 const statusCanvas=document.createElement('canvas');statusCanvas.width=1024;statusCanvas.height=576;
 const statusTexture=new T.CanvasTexture(statusCanvas);statusTexture.colorSpace=T.SRGBColorSpace;
 for(const [i,map]of[monitor.tex,statusTexture].entries()){
  const x=i===0?-.48:.39;
  box(.76,.44,.042,dark,x,1.28,.10,'Monitor console');box(.035,.18,.035,dark,x,1.05,.12,'Braccio monitor');box(.23,.014,.17,dark,x,.983,.12,'Base monitor');
  const screen=plane(.71,.399,new T.MeshBasicMaterial({map,toneMapped:false}),x,1.28,.073,i?'Schermo direzione gara':'Schermo cronometraggio',Math.PI);screen.userData.dynamic=true;
 }
 const keyboard=plane(.47,.18,new T.MeshStandardMaterial({map:details.keyboard,roughness:.8}),-.35,.982,-.22,'Tastiera direzione gara');keyboard.rotation.set(-Math.PI/2,0,Math.PI);
 box(.48,.012,.19,dark,-.35,.973,-.22,'Base tastiera');
 const mouse=part(new T.SphereGeometry(.037,12,8),dark,-.01,.989,-.24,'Mouse');mouse.scale.set(.8,.42,1.2);
 box(.36,.075,.21,dark,.68,1.007,-.22,'Interfaccia cronometraggio');
 const lamps=[];for(const [i,color]of[0x39c98a,0xffbf47,0xe74b52].entries()){
  const mat=new T.MeshBasicMaterial({color:0x29313a,toneMapped:false});const light=part(new T.CylinderGeometry(.014,.014,.007,12),mat,.58+i*.085,1.049,-.17,'Spia stato gara');light.userData.dynamic=true;lamps.push({mat,color});
 }
 const buttonRed=new T.MeshStandardMaterial({color:0xb91f2c,roughness:.5});
 for(const [x,mat]of[[.6,buttonRed],[.76,accent]])part(new T.CylinderGeometry(.025,.025,.014,16),mat,x,1.055,-.26,'Pulsante pannello');
 box(.22,.45,.38,dark,-.68,.45,-.07,'PC direzione gara');
 for(let i=0;i<6;i++)box(.14,.008,.006,M.darkMetal,-.68,.35+i*.037,-.264,'Griglia PC');
 // Cables stay inside the desk, with a floor trunk to the front wall.
 const route=new T.CatmullRomCurve3([[.72,1.0,-.17],[.84,.86,-.29],[.84,.13,-.28],[.84,.025,-.43],[.84,.025,-1.08]].map(p=>new T.Vector3(...p)));
 part(new T.TubeGeometry(route,18,.007,6,false),dark,0,0,0,'Cavo raccolto');box(.06,.025,.52,dark,.84,.0125,-.81,'Canalina a pavimento');
 batchStatic(root);
 const director=directorPerson(cast);director.position.set(-.30,0,-.67);director.rotation.y=Math.PI;root.add(director);
 const out={root,director,trackId,cast,sponsor,monitor,statusCanvas,statusTexture,lamps,decals,snapshot:null};
 out.ready=(trackId==='policar'?posterTexture(loader,'slotit-user'):consoleTexture(loader,sponsor.id)).then(map=>{const ratio=map.image.width/map.image.height;for(const d of decals){const {width:w,height:h}=d.geometry.parameters,width=Math.min(w,h*ratio);d.scale.set(width/w,width/ratio/h,1);d.material.map=map;d.material.needsUpdate=true;d.visible=true;}return true;}).catch(()=>false);
 updateRaceControl(out);return out;
}

const clock=seconds=>{const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
// Read-only projection of the existing race controller: no duplicate timer,
// invented laps, altered regulations or independent start/stop state.
export function updateRaceControl(console,{race,cars=[],drag}={}){
 if(!console)return;
 const active=race?.trackId===console.trackId,dragging=active&&drag?.active;
 const state=!active||race.demo?'standby':dragging?drag.phase:race.state;
 const labels={standby:'SALA IN ATTESA',setup:'PREPARAZIONE',pre:'PARTENZA',run:'GARA IN CORSO',stop:'FINE MANCHE',swap:'CAMBIO CORSIA',finish:'GARA TERMINATA',ready:'PRE-STAGE',stage:'DRAG IN CORSO',result:'RISULTATO BATTERIA',done:'GARA TERMINATA'};
 const text=labels[state]||'PREPARAZIONE',green=['run','stage'].includes(state),amber=['pre','swap','ready'].includes(state);
 const time=!active||race.demo?'—':clock(dragging?drag.clock:race.T);
 const heat=!active||race.demo?'—':dragging?`${drag.ri+1}/${drag.rounds.length}`:`${Math.min(race.heat+(race.state==='swap'?2:1),race.heats)}/${race.heats}`;
 const rows=active&&!race.demo?cars.filter(c=>!dragging||c.dg?.on).map(c=>({lane:c.lane+1,driver:c.drv||c.code||'',laps:dragging?(c.dg.rt==null?'—':c.dg.rt.toFixed(3)):Math.max(0,c.laps),last:(dragging?c.dg.et:c.last)==null?'—':(dragging?c.dg.et:c.last).toFixed(3)})).sort((a,b)=>a.lane-b.lane):[];
 // Sixteen entries: eight rows at a time, alternating every six seconds.
 const page=rows.length>8?Math.floor(Date.now()/6000)%Math.ceil(rows.length/8):0;
 const snapshot={state,text,time,heat,rows,page},signature=JSON.stringify(snapshot);if(console.signature===signature)return;
 console.signature=signature;console.snapshot=snapshot;
 const {statusCanvas:cv,statusTexture:tex}=console,g=cv.getContext('2d'),w=cv.width;
 g.fillStyle='#101b27';g.fillRect(0,0,w,cv.height);g.fillStyle='#b91f2c';g.fillRect(0,0,w,64);g.fillStyle='#fff';g.font='bold 32px sans-serif';g.fillText(`DIREZIONE GARA · ${console.cast.room}`,28,43);
 g.fillStyle=green?'#56dfa4':amber?'#ffd06a':'#d8e0e9';g.font='bold 44px sans-serif';g.fillText(text,28,131);
 g.fillStyle='#a7b7c9';g.font='26px sans-serif';g.fillText(`${console.cast.name}  •  ${dragging?'BATTERIA':'MANCHE'} ${heat}`,28,178);g.fillStyle='#fff';g.font='bold 46px monospace';g.fillText(time,780,177);
 g.fillStyle='#7f99af';g.font='22px sans-serif';g.fillText('CORSIA / PILOTA',28,229);g.fillText(dragging?'REAZIONE':'GIRI',635,229);g.fillText(dragging?'TEMPO':'ULTIMO',813,229);
 rows.slice(page*8,page*8+8).forEach((r,i)=>{const y=264+i*36;g.fillStyle=i%2?'#1a2939':'#152333';g.fillRect(20,y-26,984,34);g.fillStyle='#e2ebf4';g.font='24px monospace';g.fillText(`${r.lane}  ${r.driver}`,30,y);g.fillText(String(r.laps),675,y);g.fillText(r.last,819,y);});
 if(!rows.length){g.fillStyle='#a7b7c9';g.font='28px sans-serif';g.fillText('Cronometraggio collegato al maxischermo',28,290);}
 console.lamps.forEach((lamp,i)=>lamp.mat.color.setHex((i===0?green:i===1?amber:!green&&!amber&&state!=='standby')?lamp.color:0x29313a));tex.needsUpdate=true;
}

