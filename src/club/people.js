// Persone: proporzioni reali (1.75 m), testa modellata con volto, mani con dita, vestiti in tessuto,
// commissari con gilet ad alta visibilità e bande riflettenti
import * as THREE from 'three';
import {makeSlotController} from './slot-controller.js';
import { canvasTex } from './util.js';
import { FONT, clubEmblem } from './banners.js';
import {createPersonMotion} from './person-motion.js';

const SKINS = [0xe8c4a8, 0xd9a987, 0xc58c67, 0x8d5a3b, 0xf0d0b8];
const lathe = (pts, seg = 22) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
const hex = h => '#' + h.toString(16).padStart(6, '0');
const fabricNoise = (g, w, h, a = 0.05) => { for (let i = 0; i < w * h / 20; i++){ g.fillStyle = `rgba(${Math.random() < .5 ? 0 : 255},${Math.random() < .5 ? 0 : 255},${Math.random() < .5 ? 0 : 255},${a})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); } };
const folds = (g, w, h, n = 16, a = 0.1) => { for (let i = 0; i < n; i++){ const x = Math.random() * w, gr = g.createLinearGradient(x - 14, 0, x + 14, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 14, h * (0.2 + Math.random() * 0.3), 28, h); } };

function shirtTexture(col, print){
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = hex(col); g.fillRect(0, 0, w, h); fabricNoise(g, w, h, 0.045); folds(g, w, h);
    const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(255,255,255,.06)'); sh.addColorStop(1, 'rgba(0,0,0,.15)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
    if (print){ g.save(); g.translate(w * 0.5, h * 0.42); clubEmblem(g, 0, -12, 0.42); g.fillStyle = print === 'dark' ? '#111' : '#fff'; g.font = `900 24px ${FONT}`; g.textAlign = 'center'; g.fillText('SLOT CAR CLUB', 0, 40); g.restore();
      g.save(); g.translate(w * 0.0 + 60, h * 0.38); clubEmblem(g, 0, 0, 0.16); g.restore(); }
  });
}
function vestTexture(){
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#ff6d0a'; g.fillRect(0, 0, w, h); fabricNoise(g, w, h, 0.06); folds(g, w, h, 10, 0.08);
    for (const y of [0.42, 0.66]){ g.fillStyle = '#c9ced4'; g.fillRect(0, h * y, w, h * 0.07); for (let x = 0; x < w; x += 3){ g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.3})`; g.fillRect(x, h * y, 1, h * 0.07); } }
    g.fillStyle = '#111'; g.font = `900 26px ${FONT}`; g.textAlign = 'center'; g.fillText('COMMISSARIO', w * 0.5, h * 0.3);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(w * 0.0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
  });
}
let DENIM = null, DARKP = null;
function trousers(col){
  return canvasTex(256, 256, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2){ g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`; g.fillRect(0, y, w, 1); } fabricNoise(g, w, h, 0.05); folds(g, w, h, 8, 0.12); });
}
// volto disegnato sulla texture della testa (u = 0.75 è il davanti)
function faceTexture(skin, hair, o){
  return canvasTex(512, 256, (g, w, h) => {
    const c = new THREE.Color(skin); g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++){ g.fillStyle = `rgba(${Math.random() < .5 ? 120 : 255},${Math.random() < .5 ? 60 : 200},${Math.random() < .5 ? 40 : 180},.03)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    const cx = w * 0.75, U = u => cx + u * w, V = v => (1 - v) * h;
    // guance leggermente rosate
    for (const s of [-1, 1]){ const gr = g.createRadialGradient(U(s * 0.055), V(0.44), 2, U(s * 0.055), V(0.44), 26); gr.addColorStop(0, 'rgba(200,90,80,.18)'); gr.addColorStop(1, 'rgba(200,90,80,0)'); g.fillStyle = gr; g.fillRect(U(s * 0.055) - 30, V(0.44) - 30, 60, 60); }
    // occhi
    for (const s of [-1, 1]){
      const ex = U(s * 0.042), ey = V(0.535);
      g.fillStyle = 'rgba(90,50,40,.25)'; g.beginPath(); g.ellipse(ex, ey - 2, 13, 7, 0, 0, 7); g.fill();       // ombra orbita
      g.fillStyle = '#f2eee8'; g.beginPath(); g.ellipse(ex, ey, 9, 4.2, 0, 0, 7); g.fill();
      g.fillStyle = o.eyes || '#4a3524'; g.beginPath(); g.arc(ex + s * 0.5, ey, 3.6, 0, 7); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(ex + s * 0.5, ey, 1.6, 0, 7); g.fill();
      g.strokeStyle = 'rgba(40,20,15,.7)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(ex, ey, 9, 4.2, 0, Math.PI, 0); g.stroke();
      // sopracciglio
      g.strokeStyle = '#' + new THREE.Color(hair).getHexString(); g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - s * 9, ey - 11); g.quadraticCurveTo(ex, ey - 15, ex + s * 10, ey - 10); g.stroke();
    }
    // naso (ombra) e bocca
    g.fillStyle = 'rgba(120,60,40,.18)'; g.beginPath(); g.ellipse(U(0), V(0.465), 7, 4, 0, 0, 7); g.fill();
    g.fillStyle = o.lip || '#b56a5e'; g.beginPath(); g.moveTo(U(-0.03), V(0.395)); g.quadraticCurveTo(U(0), V(0.41), U(0.03), V(0.395)); g.quadraticCurveTo(U(0), V(0.378), U(-0.03), V(0.395)); g.fill();
    g.strokeStyle = 'rgba(70,30,25,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(U(-0.03), V(0.395)); g.quadraticCurveTo(U(0), V(0.4), U(0.03), V(0.395)); g.stroke();
    if (o.beard){ g.fillStyle = 'rgba(40,28,20,.35)'; g.beginPath(); g.ellipse(U(0), V(0.35), 44, 28, 0, 0, 7); g.fill(); }
  });
}
// testa: sfera deformata (mandibola, mento, naso, arcate sopraccigliari)
function headGeometry(){
  const g = new THREE.SphereGeometry(0.1, 40, 30), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){
    v.fromBufferAttribute(p, i).divideScalar(0.1);
    let { x, y, z } = v; const front = Math.max(0, -z);
    x *= 0.76; y *= 1.04; z *= 0.93;
    if (y < -0.1){ const k = (-y - 0.1); x *= 1 - k * 0.45; z -= k * front * 0.25; }             // mandibola e mento
    z -= 0.13 * front * Math.exp(-((x / 0.11) ** 2 + ((y + 0.06) / 0.22) ** 2)) * (y < 0.1 ? 1 : 0.6); // naso
    z -= 0.05 * front * Math.exp(-(((y - 0.26) / 0.1) ** 2)) * Math.exp(-((x / 0.45) ** 2));          // arcate
    z += 0.05 * front * Math.exp(-(((Math.abs(x) - 0.3) / 0.12) ** 2 + ((y - 0.12) / 0.1) ** 2));     // orbite
    if (y < 0.2 && y > -0.35) x *= 1 + 0.04 * front;                                                   // zigomi
    p.setXYZ(i, x * 0.1, y * 0.1, z * 0.1);
  }
  g.computeVertexNormals(); return g;
}
const HEAD_GEO = headGeometry();
function hairGeometry(style){
  const g = new THREE.SphereGeometry(0.106, 32, 20, 0, Math.PI * 2, 0, Math.PI * (style === 'long' ? 0.72 : 0.56)), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i); const n = 1 + (Math.random() - 0.5) * 0.04; const back = Math.max(0, v.z) / 0.106;
    p.setXYZ(i, v.x * 0.8 * n, v.y * 1.0 * n + 0.004, v.z * (0.97 + back * 0.05) * n + 0.004); }
  g.computeVertexNormals(); return g;
}

export function makePerson(o = {}){
  const g = new THREE.Group();g.userData.castId=o.id;g.userData.appearanceId=o.model;
  const skinHex = o.skin ?? SKINS[(Math.random() * SKINS.length) | 0], hairHex = o.hair ?? 0x2a1a10;
  const skin = new THREE.MeshPhysicalMaterial({ color: skinHex, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffb0a0) });
  const shirt = new THREE.MeshStandardMaterial({ map: shirtTexture(o.shirt ?? 0x3355aa, o.print), roughness: 0.92 });
  if (!DENIM) DENIM = trousers('#2d3b57'); if (!DARKP) DARKP = trousers('#23262c');
  const pants = new THREE.MeshStandardMaterial({ map: o.pants ? DARKP : DENIM, roughness: 0.93 });
  const shoe = new THREE.MeshStandardMaterial({ color: o.shoe ?? 0x1a1a1a, roughness: 0.45 });
  const sole = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.7 });
  const hairM = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.75 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // gambe: coscia, ginocchio, polpaccio; scarpe con suola
  for (const s of [-1, 1]){
    add(lathe([[0, 0.46], [0.05, 0.46], [0.058, 0.52], [0.064, 0.64], [0.074, 0.80], [0.082, 0.92], [0, 0.95]], 16), pants, s * 0.092, 0, 0);
    add(lathe([[0, 0.07], [0.041, 0.07], [0.046, 0.16], [0.056, 0.30], [0.052, 0.42], [0.049, 0.49], [0, 0.49]], 16), pants, s * 0.092, 0, 0);
    const sh = add(new THREE.CapsuleGeometry(0.045, 0.14, 6, 12), shoe, s * 0.092, 0.05, -0.035); sh.rotation.x = Math.PI / 2; sh.scale.set(1, 1, 0.75);
    const so = add(new THREE.BoxGeometry(0.095, 0.018, 0.25), sole, s * 0.092, 0.009, -0.035);
  }
  const legCount = g.children.length;
  // bacino, busto con spalle, colletto
  add(lathe([[0, 0.86], [0.16, 0.86], [0.172, 0.93], [0.165, 0.99], [0, 1.0]], 24), pants, 0, 0, 0).scale.z = 0.7;
  const torso = add(lathe([[0, 0.95], [0.158, 0.95], [0.155, 1.05], [0.16, 1.16], [0.178, 1.27], [0.192, 1.35], [0.19, 1.41], [0.15, 1.46], [0.08, 1.49], [0, 1.5]], 28), shirt, 0, 0, 0);
  torso.scale.z = 0.62; torso.rotation.y = Math.PI;
  if (o.vest){ const vest = add(lathe([[0, 0.97], [0.176, 0.97], [0.175, 1.08], [0.181, 1.2], [0.2, 1.3], [0.207, 1.38], [0.17, 1.45], [0.108, 1.478], [0.1, 1.479]], 28), new THREE.MeshStandardMaterial({ map: vestTexture(), roughness: 0.75, side: THREE.DoubleSide }), 0, 0, 0); vest.scale.z = 0.66; vest.rotation.y = Math.PI; }
  add(new THREE.TorusGeometry(0.06, 0.012, 8, 20), shirt, 0, 1.49, 0).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.046, 0.054, 0.12, 14), skin, 0, 1.53, 0.005);
  // testa
  const head = new THREE.Group(); head.position.set(0, 1.655, 0); g.add(head);
  const face = new THREE.MeshPhysicalMaterial({ map: faceTexture(skinHex, hairHex, o), roughness: 0.52, sheen: 0.3, sheenColor: new THREE.Color(0xffb0a0) });
  add(HEAD_GEO, face, 0, 0, 0, head);
  for (const s of [-1, 1]){ const e = add(new THREE.SphereGeometry(0.02, 10, 8), skin, s * 0.077, 0.0, 0.008, head); e.scale.set(0.45, 1, 0.8); }
  if (!o.bald){ const hr = add(hairGeometry(o.hairStyle), hairM, 0, 0.012, 0.006, head); hr.rotation.x = 0.3; }
  if (o.cap){ const capM = new THREE.MeshStandardMaterial({ color: o.cap, roughness: 0.7 }); const c = add(new THREE.SphereGeometry(0.108, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), capM, 0, 0.022, 0.004, head); c.scale.set(0.84, 0.86, 0.98);
    const visor = add(new THREE.CylinderGeometry(0.072, 0.072, 0.006, 24, 1, false, 0, Math.PI), capM, 0, 0.03, -0.075, head); visor.rotation.y = Math.PI / 2; visor.scale.set(1, 1, 0.75); visor.rotation.x = -0.12; }
  // braccia: spalla, gomito, mano con dita
  const arms = [];
  for (const s of [-1, 1]){
    const sh = new THREE.Group(); sh.position.set(s * 0.205, 1.41, 0); g.add(sh);
    add(new THREE.SphereGeometry(0.056, 14, 10), shirt, 0, 0, 0, sh);
    add(lathe([[0, -0.29], [0.041, -0.29], [0.046, -0.16], [0.053, -0.03], [0, 0.01]], 14), o.shortSleeve === false ? shirt : skin, 0, 0, 0, sh);
    add(lathe([[0, -0.16], [0.047, -0.16], [0.056, -0.04], [0, 0.01]], 14), shirt, 0, 0, 0, sh);         // manica corta
    const el = new THREE.Group(); el.position.y = -0.285; sh.add(el);
    add(lathe([[0, -0.26], [0.028, -0.26], [0.035, -0.14], [0.042, -0.02], [0, 0.015]], 14), skin, 0, 0, 0, el);
    const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
    const palm = add(new THREE.BoxGeometry(0.022, 0.085, 0.07), skin, 0, -0.04, 0, hand);
    const fingers=[];
    for (let f = 0; f < 4; f++){ const fg = add(new THREE.CapsuleGeometry(0.0075, 0.045, 3, 6), skin, 0, -0.1, -0.026 + f * 0.017, hand); fg.rotation.x = (f - 1.5) * 0.05;fingers.push(fg); }
    const th = add(new THREE.CapsuleGeometry(0.009, 0.035, 3, 6), skin, s * 0.012, -0.05, -0.038, hand); th.rotation.x = 0.5;
    arms.push({ sh, el, hand, s, fingers });
  }
  const pose = o.pose || 'stand';
  for (const a of arms){
    if (pose === 'drive'){                        // gomiti piegati, pulsante a pistola nella mano destra
      a.sh.rotation.x = 0.45; a.sh.rotation.z = a.s * 0.12; a.el.rotation.x = 1.05; a.el.rotation.z = -a.s * 0.25;
      if(a.s>0){
        const ctl=makeSlotController(o.controller);ctl.position.set(0,-.03,-.01);ctl.rotation.x=-1;
        a.hand.add(ctl);
        // Procedural fallback also places its index across the finger cup,
        // rather than leaving all four fingers hanging below the controller.
        const index=a.fingers[0],pivot=ctl.getObjectByName('ControllerTrigger');ctl.add(index);index.rotation.set(0,0,Math.PI/2);index.castShadow=index.receiveShadow=false;
        const contact=new THREE.Vector3(-.010,-.039,-.023);
        g.userData.setThrottle=value=>{ctl.userData.setThrottle(value);index.position.copy(contact).applyEuler(pivot.rotation).add(pivot.position);};g.userData.setThrottle(0);
      }
    } else if (pose === 'arms'){ a.sh.rotation.z = a.s * 0.1; a.sh.rotation.x = 0.25; a.el.rotation.x = 1.5; a.el.rotation.z = a.s * 0.9; }
    else if (pose === 'point'){ if (a.s > 0){ a.sh.rotation.x = 1.2; a.el.rotation.x = 0.2; } else a.sh.rotation.z = -0.08; }
    else { a.sh.rotation.z = a.s * 0.08; a.sh.rotation.x = 0.05; a.el.rotation.x = 0.18; a.hand.rotation.y = -a.s * 0.3; }  // braccia rilassate, leggera flessione
  }
  if (o.pose === 'service'){
    const body = new THREE.Group(); body.position.y = .95;
    const upper = g.children.slice(legCount); g.add(body);
    for (const part of upper){ part.position.y -= .95; body.add(part); }
    g.userData.body = body;
  }
  g.userData.head = head; g.userData.arms = arms;
  const motion=createPersonMotion(o),left=arms.find(a=>a.s<0),armRest=left.sh.rotation.x,elbowRest=left.el.rotation.x;
  const width=torso.scale.x,depth=torso.scale.z;
  g.userData.animate=(dt,moving=0,distance=0)=>{
    if(!g.visible)return false;
    const pose=motion.update(dt,distance);if(!pose)return false;
    head.rotation.y=pose.headYaw;head.rotation.x=pose.headPitch;
    torso.scale.x=width*(1+pose.breath);torso.scale.z=depth*(1+pose.breath);
    if(motion.role!=='driver'){left.sh.rotation.x=armRest+pose.arm;left.el.rotation.x=elbowRest+pose.elbow;}
    return true;
  };
  return g;
}

