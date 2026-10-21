// Materiali PBR procedurali: colore + ruvidità + rilievo generati su canvas
import * as THREE from 'three';
import { canvasTex, normalFromHeight, speckle, rng } from './util.js';
import { LANES } from './config.js';

const R = rng(11);

// sfumature morbide casuali (macchie, usura)
function blotches(g, w, h, n, rmin, rmax, cols, R2 = Math.random){
  for (let i = 0; i < n; i++){
    const x = R2() * w, y = R2() * h, r = rmin + R2() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const c = cols[(R2() * cols.length) | 0];
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function makeMaterials(){
  const M = {};

  /* --- pista in MDF verniciato: grigio antracite satinato, gomma scura sulle traiettorie --- */
  // texture: u = 1 m lungo la pista, v = larghezza pista (0.54 m)
  const laneV = [];
  for (const L of LANES) for (const s of [-0.028, 0.028]) laneV.push((0.27 - (L.d + s)) / 0.54);
  const trackCol = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#1e1f22'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 60, 40, 160, ['rgba(255,255,255,.025)', 'rgba(0,0,0,.05)'], R);
    speckle(g, w, h, 26000, ['rgba(255,255,255,.035)', 'rgba(0,0,0,.10)'], 1.4, R);
    for (const v of laneV){ const y = v * h;
      for (let x = 0; x < w; x += 2){ g.fillStyle = `rgba(8,8,9,${0.18 + R() * 0.22})`; g.fillRect(x, y - 7 - R() * 3, 2, 14 + R() * 5); } }
  });
  const trackRough = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = 'rgb(190,190,190)'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 20000, ['rgb(160,160,160)', 'rgb(215,215,215)'], 1.5, R);
    for (const v of laneV){ const gr = g.createLinearGradient(0, v * h - 14, 0, v * h + 14); gr.addColorStop(0, 'rgba(100,100,100,0)'); gr.addColorStop(.5, 'rgba(100,100,100,.9)'); gr.addColorStop(1, 'rgba(100,100,100,0)'); g.fillStyle = gr; g.fillRect(0, v * h - 14, w, 28); }
  }, { data: true });
  const trackNorm = normalFromHeight(512, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); blotches(g, w, h, 900, 2, 7, ['rgba(255,255,255,.25)', 'rgba(0,0,0,.25)'], R); }, 1.2);
  M.track = new THREE.MeshStandardMaterial({ map: trackCol, roughnessMap: trackRough, normalMap: trackNorm, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 1, metalness: 0 });

  /* --- treccia di rame: trama intrecciata, metallo spazzolato --- */
  const braidCol = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#b87142'; g.fillRect(0, 0, w, h);
    for (let x = -h; x < w + h; x += 8){ g.strokeStyle = 'rgba(255,210,160,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke();
      g.strokeStyle = 'rgba(90,40,15,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 4, h); g.lineTo(x + 4 + h, 0); g.stroke(); }
    speckle(g, w, h, 1500, ['rgba(40,20,5,.35)', 'rgba(255,230,200,.3)'], 1, R);
  });
  const braidNorm = normalFromHeight(256, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let x = -h; x < w + h; x += 8){ g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.strokeStyle = '#888'; g.beginPath(); g.moveTo(x + 4, h); g.lineTo(x + 4 + h, 0); g.stroke(); } }, 3);
  M.braid = new THREE.MeshStandardMaterial({ map: braidCol, normalMap: braidNorm, normalScale: new THREE.Vector2(0.6, 0.6), metalness: 1, roughness: 0.38 });

  M.slot = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
  M.slotWall = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.9 });     // MDF nudo dentro lo slot
  M.line = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.55 });
  M.kerb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });

  /* --- prato in flock (floccato) --- */
  const grassCol = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#35602a'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 90, 20, 90, ['rgba(80,120,40,.25)', 'rgba(20,45,15,.3)', 'rgba(110,120,50,.18)'], R);
    speckle(g, w, h, 60000, ['#3f7032', '#2a4d20', '#4d8038', '#2f5424', '#5e8a42', '#6f7f3a'], 1.6, R);
  });
  const grassNorm = normalFromHeight(512, 512, (g, w, h) => { g.fillStyle = '#777'; g.fillRect(0, 0, w, h); speckle(g, w, h, 70000, ['#fff', '#000', '#aaa'], 1.8, R); }, 2.5);
  M.grass = new THREE.MeshStandardMaterial({ map: grassCol, normalMap: grassNorm, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1 });
  M.grassBoard = M.grass.clone(); M.grassBoard.map = grassCol.clone(); M.grassBoard.map.needsUpdate = true; M.grassBoard.map.repeat.set(26, 15);
  M.grassBoard.normalMap = grassNorm.clone(); M.grassBoard.normalMap.needsUpdate = true; M.grassBoard.normalMap.repeat.set(26, 15);

  /* --- legno (compensato di betulla / MDF) --- */
  const woodCol = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#b08457'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++){ const y = R() * h, a = 0.05 + R() * 0.16; g.strokeStyle = `rgba(90,52,22,${a})`; g.lineWidth = 0.6 + R() * 2.4; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.006 + i) * 6 + Math.sin(x * 0.03 + i * 3) * 1.5); g.stroke(); }
    blotches(g, w, h, 20, 20, 80, ['rgba(120,70,30,.12)', 'rgba(255,220,170,.08)'], R);
  });
  M.wood = new THREE.MeshStandardMaterial({ map: woodCol, roughness: 0.55, metalness: 0 });
  M.woodDark = new THREE.MeshStandardMaterial({ map: woodCol, color: 0x6a4a30, roughness: 0.45 });

  /* --- pavimento in cemento spatolato lucido (riflette le plafoniere) --- */
  const floorCol = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#8a8c8e'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 160, 40, 220, ['rgba(60,60,62,.12)', 'rgba(170,170,168,.12)', 'rgba(110,100,90,.08)'], R);
    speckle(g, w, h, 40000, ['rgba(40,40,40,.18)', 'rgba(220,220,220,.12)'], 1.3, R);
    g.strokeStyle = 'rgba(40,40,42,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 1); g.lineTo(w, 1); g.moveTo(1, 0); g.lineTo(1, h); g.stroke();
  }, { repeat: [5, 4] });
  const floorRough = canvasTex(512, 512, (g, w, h) => { g.fillStyle = 'rgb(70,70,70)'; g.fillRect(0, 0, w, h); blotches(g, w, h, 90, 20, 120, ['rgba(160,160,160,.35)', 'rgba(30,30,30,.4)'], R); }, { repeat: [5, 4], data: true });
  M.floor = new THREE.MeshStandardMaterial({ map: floorCol, roughnessMap: floorRough, roughness: 1, metalness: 0 });

  /* --- pareti in intonaco verniciato --- */
  const plasterN = normalFromHeight(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); blotches(g, w, h, 700, 2, 9, ['rgba(255,255,255,.3)', 'rgba(0,0,0,.3)'], R); }, 1.5, [8, 3]);
  M.plasterN = plasterN;

  /* --- moquette del podio --- */
  const carpetCol = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#2b2f38'; g.fillRect(0, 0, w, h); speckle(g, w, h, 30000, ['#232730', '#353a45', '#1d2028'], 1.2, R); }, { repeat: [6, 2] });
  M.carpet = new THREE.MeshStandardMaterial({ map: carpetCol, roughness: 1 });

  /* --- gonna in tessuto nero con pieghe --- */
  const skirtN = normalFromHeight(256, 32, (g, w, h) => { for (let x = 0; x < w; x++){ const v = 128 + Math.round(90 * Math.sin(x * 0.2) + 30 * Math.sin(x * 0.07 + 1)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, h); } }, 4);
  M.skirt = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.95, normalMap: skirtN, normalScale: new THREE.Vector2(1.2, 1.2) });

  M.metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.3 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.7, roughness: 0.38 });
  M.blackPlastic = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.45 });
  M.white = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.4 });
  M.concrete = new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.85, normalMap: plasterN });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
  return M;
}

