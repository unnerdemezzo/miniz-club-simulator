import * as THREE from 'three';
import { canvasTex } from './util.js';
import { FONT } from './banners.js';
import { LANES } from './config.js';
import { vehicleCategory } from './vehicle-catalog.js';

// Printed details reuse existing surfaces: no extra props or lights.
export function makeClubDetails(laneDefs=LANES,{digital=false}={}){
  const LANES=laneDefs;
  const stationLabels = LANES.map((lane, i) => canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#14181e'; g.fillRect(0, 0, w, h);
    g.fillStyle = lane.css; g.fillRect(0, 0, 22, h); g.fillRect(22, h - 12, w - 22, 12);
    g.fillStyle = '#fff'; g.font = `900 76px ${FONT}`; g.fillText(String(i + 1).padStart(2, '0'), 44, 102);
    g.font = `700 34px ${FONT}`; g.fillText(digital?'PILOTA '+(i+1):'CORSIA ' + lane.name.toUpperCase(), 44, 159, w - 68);
    g.fillStyle = '#b5bec9'; g.font = `600 24px ${FONT}`; g.fillText('SLOT CAR CLUB · POSTAZIONE', 44, 211, w - 68);
    g.strokeStyle = '#7b838b'; g.lineWidth = 3;
    for (const x of [12, w - 12]) for (const y of [12, h - 25]){ g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.stroke(); }
  }, { clamp: true }));
  const benchMat = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2f6b4a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(213,236,213,.22)'; g.lineWidth = 1;
    for (let n = 24; n <= 488; n += 24){ g.beginPath(); g.moveTo(n, 24); g.lineTo(n, 464); g.moveTo(24, n); g.lineTo(488, n); g.stroke(); }
    g.strokeStyle = '#9fbea5'; g.lineWidth = 2; g.strokeRect(24, 24, 464, 440);
    g.fillStyle = '#d7e8d9'; g.font = `700 16px ${FONT}`; g.fillText('SLOT CAR CLUB · BANCO ASSETTO', 30, 494);
    g.font = `600 12px ${FONT}`;
    for (let i = 0; i <= 10; i++){ const x = 26 + i * 44; g.fillRect(x, 26, 2, 9); g.fillText(String(i * 10), x + 3, 44); }
  }, { clamp: true });
  const supply = canvasTex(384, 256, (g, w, h) => {
    g.fillStyle = '#1c222b'; g.fillRect(0, 0, w, h); g.fillStyle = '#09130e'; g.fillRect(25, 28, 206, 100);
    g.fillStyle = '#a7e4bc'; g.font = '700 60px monospace'; g.fillText('12.0', 38, 103);
    g.fillStyle = '#bbc3cd'; g.font = `700 20px ${FONT}`; g.fillText('V DC', 254, 75); g.fillText('ALIMENTAZIONE PISTA', 25, 172, 330);
    for (let i = 0; i < 9; i++){ g.fillStyle = '#080b10'; g.fillRect(25 + i * 24, 204, 14, 5); }
    for (const [x, color] of [[280, '#bc3036'], [332, '#1a1c22']]){ g.fillStyle = '#87919e'; g.beginPath(); g.arc(x, 207, 18, 0, Math.PI * 2); g.fill(); g.fillStyle = color; g.beginPath(); g.arc(x, 207, 13, 0, Math.PI * 2); g.fill(); }
  }, { clamp: true });
  const keyboard = canvasTex(512, 192, (g, w, h) => {
    g.fillStyle = '#14171c'; g.fillRect(0, 0, w, h);
    const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    rows.forEach((row, r) => [...row].forEach((key, c) => {
      const x = 16 + c * 35 + r * 6, y = 8 + r * 34; g.fillStyle = '#363c46'; g.fillRect(x, y, 29, 27); g.fillStyle = '#cdd2d9'; g.font = '15px sans-serif'; g.fillText(key, x + 7, y + 20);
    }));
    g.fillStyle = '#363c46'; g.fillRect(100, 148, 200, 30);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++){ g.fillStyle = '#303641'; g.fillRect(400 + c * 34, 8 + r * 34, 28, 27); }
  }, { clamp: true });
  const boxLabels = vehicleCategory().cars.map((car, i) => canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#eceee9'; g.fillRect(0, 0, w, h); g.fillStyle = LANES[i%LANES.length].css; g.fillRect(0, 0, 14, h);
    g.fillStyle = '#202832'; g.font = `900 36px ${FONT}`; g.fillText('GT3 · 1:32', 32, 55);
    g.font = `700 25px ${FONT}`; g.fillText(car.name, 32, 102, w - 52);
    g.fillStyle = '#66717c'; g.font = `600 18px ${FONT}`; g.fillText('SLOT CAR CLUB · MODELLI E RICAMBI', 32, 151, w - 52);
    ['#c8141b', '#1f4fd1', '#f2c230', '#222222', '#eeeeee', '#0f7a36'].forEach((color, i) => { g.fillStyle = color; g.fillRect(i * w / 6, 192, w / 6 + 1, 64); });
  }, { clamp: true }));
  return { stationLabels, benchMat, supply, keyboard, boxLabels };
}
export function createStationDisplays(laneDefs=LANES){
  const canvas = document.createElement('canvas'); canvas.width = laneDefs.length*256; canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const display = { canvas, tex, lanes:laneDefs.map(l=>({...l})), signature: '' };
  updateStationDisplays(display, []); return display;
}
export function updateStationDisplays(display, cars, dragActive = false, rallyChrono=false,rallyHotlap=false){
  const values = (display.lanes||LANES).map((lane, i) => {
    const digital=cars.some(c=>['oxigen','oxigen16'].includes(c.trackId));
    const car = cars.find(c => digital?(c.stationIndex??c.idx)===i:dragActive ? c.idx === i && c.dg?.on : c.lane === i&&!c.rallyWaiting);
    return { color: (dragActive||digital) && car ? LANES[car.lane].css : lane.css, text: dragActive ? car ? (car?.dg?.rt == null ? 'READY' : car.dg.rt.toFixed(3)) : '—' : rallyChrono ? car ? car.last?.toFixed(3)||'READY' : '—' : car?String(Math.max(0,car.laps||0)).padStart(3,'0'):'—', label: dragActive ? 'RT · SECONDI' : rallyHotlap?'GIRO · SECONDI':rallyChrono?'PS · SECONDI':car?'GIRI':'LIBERA' };
  });
  const signature = JSON.stringify(values); if (signature === display.signature) return;
  display.signature = signature;
  const g = display.canvas.getContext('2d');
  values.forEach((v, i) => {
    const x = i * 256; g.fillStyle = '#060a0e'; g.fillRect(x, 0, 256, 128);
    g.fillStyle = v.color; g.font = '700 68px monospace'; g.textAlign = 'center'; g.fillText(v.text, x + 128, 77, 224);
    g.fillStyle = '#a2adba'; g.font = `700 24px ${FONT}`; g.fillText(v.label, x + 128, 113, 224);
  });
  display.tex.needsUpdate = true;
}

// Keep a box to one material/draw: print only its selected face. Other faces
// sample a plain atlas area, rather than adding five material groups per prop.
export function printBoxFace(mesh, face, plain = [0, 0], region = [0, 0, 1, 1]){
  const uv = mesh.geometry.attributes.uv;
  for (let f = 0; f < 6; f++) for (let j = 0; j < 4; j++){
    const i = f * 4 + j;
    if (f === face) uv.setXY(i, region[0] + uv.getX(i) * region[2], region[1] + uv.getY(i) * region[3]);
    else uv.setXY(i, plain[0], plain[1]);
  }
  return mesh;
}
