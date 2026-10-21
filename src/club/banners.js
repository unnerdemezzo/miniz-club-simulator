// Grafiche del club: striscioni, cartelloni sponsor, poster, orologio
import { canvasTex, rng } from './util.js';

export const FONT = '"Titillium Web", "Arial Narrow", Arial, sans-serif';
const R = rng(5);

function rr(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function grain(g, w, h, a = 0.05){ for (let i = 0; i < w * h / 60; i++){ g.fillStyle = `rgba(${R() < .5 ? 0 : 255},${R() < .5 ? 0 : 255},${R() < .5 ? 0 : 255},${a * R()})`; g.fillRect(R() * w, R() * h, 1, 1); } }
function checker(g, x, y, cols, rows, s, a = 1){ for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++){ g.fillStyle = (i + j) % 2 ? `rgba(20,20,20,${a})` : `rgba(245,245,245,${a})`; g.fillRect(x + i * s, y + j * s, s, s); } }

export function clubEmblem(g, cx, cy, s){
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.fillStyle = '#b3161d'; g.beginPath(); g.moveTo(-50, -60); g.lineTo(50, -60); g.lineTo(50, 10); g.quadraticCurveTo(50, 50, 0, 70); g.quadraticCurveTo(-50, 50, -50, 10); g.closePath(); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
  g.save(); g.beginPath(); g.moveTo(-34, -40); for (let x = -34; x <= 34; x += 4) g.lineTo(x, -40 + Math.sin(x * 0.09) * 6); for (let x = 34; x >= -34; x -= 4) g.lineTo(x, 22 + Math.sin(x * 0.09) * 6); g.closePath(); g.clip();
  for (let i = 0; i < 9; i++) for (let j = 0; j < 8; j++){ g.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'; g.fillRect(-36 + i * 8.5, -44 + j * 8.5 + Math.sin((-36 + i * 8.5) * 0.09) * 6, 8.6, 8.6); }
  g.restore(); g.restore();
}

export function mainBanner(){
  return canvasTex(2048, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d2230'); gr.addColorStop(1, '#0c0f16'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8141b'; g.beginPath(); g.moveTo(0, 0); g.lineTo(560, 0); g.lineTo(470, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(575, 0); g.lineTo(600, 0); g.lineTo(510, h); g.lineTo(485, h); g.fill();
    checker(g, 1760, 0, 12, 12, 24, 0.9);
    const fade = g.createLinearGradient(1700, 0, 1900, 0); fade.addColorStop(0, '#12161f'); fade.addColorStop(1, 'rgba(18,22,31,0)'); g.fillStyle = fade; g.fillRect(1700, 0, 220, h);
    clubEmblem(g, 150, 128, 1.45);
    g.fillStyle = '#fff'; g.font = `italic 900 112px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText('MINI-Z RC CLUB', 270, 158, 650);
    g.fillStyle = '#ffc93c'; g.font = `700 40px ${FONT}`; g.fillText('CAMPIONATO NAZIONALE MINI-Z', 1020, 91, 690);
    g.fillStyle = '#fff'; g.font = `600 32px ${FONT}`; g.fillText('SCALA 1:27 · PISTA KYOSHO RCP', 1020, 143, 690);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `600 28px ${FONT}`; g.fillText('Telemetria IC-Tag · MR-04 / MA-030 · dal 1999', 1020, 189, 690);
    grain(g, w, h, 0.05);
  }, { clamp: true });
}

export const BRANDS = [
  { name: 'KYOSHO', sub: 'MINI-Z RACING', bg: '#c8141b', fg: '#ffffff', style: 'slash' },
  { name: 'PN RACING', sub: 'WORLD PRO', bg: '#f4f5f7', fg: '#1f4fd1', style: 'hex' },
  { name: 'M-POWER', sub: 'RADIAL TYRES', bg: '#0f7a36', fg: '#ffd21f', style: 'ring' },
  { name: 'ATOMIC', sub: 'CARBON PARTS', bg: '#10306e', fg: '#ff8a00', style: 'wing' },
  { name: 'SYNCRO', sub: '2.4GHz RADIO', bg: '#141414', fg: '#ffd400', style: 'bolt' },
  { name: 'RCP TRACK', sub: 'URETHANE EVA', bg: '#ffffff', fg: '#c8141b', style: 'plus' },
  { name: 'X-SPEED', sub: 'BRUSHLESS', bg: '#5b2a86', fg: '#ffffff', style: 'slash' },
  { name: 'GL RACING', sub: 'PRECISION RC', bg: '#ff6a00', fg: '#111111', style: 'ring' },
];
function brandLogo(g, b, x, y, s){
  g.save(); g.translate(x, y); g.fillStyle = b.fg; g.strokeStyle = b.fg; g.lineWidth = 6 * s;
  if (b.style === 'slash'){ for (let i = 0; i < 3; i++){ g.beginPath(); g.moveTo((i * 22) * s, 30 * s); g.lineTo((i * 22 + 18) * s, -30 * s); g.lineTo((i * 22 + 30) * s, -30 * s); g.lineTo((i * 22 + 12) * s, 30 * s); g.fill(); } }
  else if (b.style === 'hex'){ g.beginPath(); for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; g.lineTo(30 * s + Math.cos(a) * 30 * s, Math.sin(a) * 30 * s); } g.closePath(); g.stroke(); g.beginPath(); g.arc(30 * s, 0, 10 * s, 0, 7); g.fill(); }
  else if (b.style === 'ring'){ g.beginPath(); g.arc(30 * s, 0, 28 * s, 0, 7); g.stroke(); g.beginPath(); g.arc(30 * s, 0, 14 * s, 0, 7); g.stroke(); }
  else if (b.style === 'wing'){ g.beginPath(); g.moveTo(0, 20 * s); g.quadraticCurveTo(30 * s, -40 * s, 64 * s, -10 * s); g.quadraticCurveTo(30 * s, -12 * s, 0, 20 * s); g.fill(); }
  else if (b.style === 'bolt'){ g.beginPath(); g.moveTo(24 * s, -32 * s); g.lineTo(4 * s, 4 * s); g.lineTo(22 * s, 4 * s); g.lineTo(12 * s, 32 * s); g.lineTo(44 * s, -8 * s); g.lineTo(26 * s, -8 * s); g.lineTo(38 * s, -32 * s); g.closePath(); g.fill(); }
  else { g.fillRect(20 * s, -30 * s, 20 * s, 60 * s); g.fillRect(0, -10 * s, 60 * s, 20 * s); }
  g.restore();
}
export function brandBoard(b, w = 1024, h = 192){
  return canvasTex(w, h, (g) => {
    g.fillStyle = b.bg; g.fillRect(0, 0, w, h);
    const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.12)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
    const s = h / 192;
    brandLogo(g, b, 60 * s, h / 2, 1.3 * s);
    g.fillStyle = b.fg; g.font = `italic 900 ${96 * s}px ${FONT}`; g.textBaseline = 'middle'; g.fillText(b.name, 170 * s, h / 2 - 12 * s);
    g.font = `700 ${30 * s}px ${FONT}`; g.globalAlpha = 0.85; g.fillText(b.sub, 174 * s, h / 2 + 50 * s); g.globalAlpha = 1;
    grain(g, w, h, 0.04);
  }, { clamp: true });
}

function posterBase(g, w, h, bg){ g.fillStyle = bg; g.fillRect(0, 0, w, h); grain(g, w, h, 0.05); }
export function posterCalendar(){
  return canvasTex(512, 720, (g, w, h) => {
    posterBase(g, w, h, '#f3f1ec');
    g.fillStyle = '#c8141b'; g.fillRect(0, 0, w, 120); clubEmblem(g, 60, 60, 0.6);
    g.fillStyle = '#fff'; g.font = `900 46px ${FONT}`; g.fillText('CALENDARIO 2026', 110, 76);
    const rows = [['18 GEN', 'MR-04 Cup · Round 1', '✓'], ['15 FEB', 'MR-04 Cup · Round 2', '✓'], ['22 MAR', 'Endurance 2 ore RCP', '✓'], ['19 APR', 'MR-04 Cup · Round 3', '✓'], ['24 MAG', 'Trofeo LM Hypercar', '✓'], ['21 GIU', 'MR-04 Cup · Round 4', '✓'], ['27 SET', 'MR-04 Cup · Round 5', '●'], ['25 OTT', 'AWD Drift Battle', ''], ['29 NOV', 'Finale + premiazione', '']];
    rows.forEach((r, i) => { const y = 170 + i * 58; g.fillStyle = i % 2 ? '#fff' : '#e8e5de'; g.fillRect(24, y - 34, w - 48, 52);
      g.fillStyle = r[2] === '●' ? '#c8141b' : '#222'; g.font = `800 26px ${FONT}`; g.fillText(r[0], 40, y); g.font = `600 24px ${FONT}`; g.fillStyle = '#333'; g.fillText(r[1], 150, y); g.fillStyle = r[2] === '●' ? '#c8141b' : '#1b8a3a'; g.fillText(r[2], w - 60, y); });
    g.fillStyle = '#555'; g.font = `600 20px ${FONT}`; g.fillText('Ritrovo ore 20:30 · prove libere 21:00', 30, h - 30);
  }, { clamp: true });
}
export function posterStandings(){
  return canvasTex(512, 720, (g, w, h) => {
    posterBase(g, w, h, '#0f1420');
    g.fillStyle = '#ffc93c'; g.font = `900 44px ${FONT}`; g.fillText('CLASSIFICA', 30, 70); g.fillStyle = '#fff'; g.font = `700 26px ${FONT}`; g.fillText('Campionato Mini-Z 1:27', 30, 106);
    const n = ['Sara B.', 'Marco R.', 'Tu', 'Luca P.', 'Giorgio M.', 'Elena V.', 'Paolo T.', 'Andrea C.', 'Fabio L.', 'Chiara D.'];
    n.forEach((x, i) => { const y = 160 + i * 52; g.fillStyle = i < 3 ? ['#d4a93a', '#c0c4c8', '#b0703a'][i] : 'rgba(255,255,255,.08)'; g.fillRect(24, y - 30, 46, 42);
      g.fillStyle = i < 3 ? '#111' : '#fff'; g.font = `900 26px ${FONT}`; g.fillText(String(i + 1), 38, y); g.fillStyle = '#fff'; g.font = `700 26px ${FONT}`; g.fillText(x, 90, y);
      g.fillStyle = '#ffc93c'; g.fillText(String(128 - i * 11 - (i > 2 ? 4 : 0)), w - 90, y); });
  }, { clamp: true });
}
export function posterRules(){
  return canvasTex(512, 720, (g, w, h) => {
    posterBase(g, w, h, '#fbfaf6');
    g.fillStyle = '#10306e'; g.fillRect(0, 0, w, 100); g.fillStyle = '#fff'; g.font = `900 40px ${FONT}`; g.fillText('REGOLAMENTO MINI-Z', 28, 64);
    const t = ['• Qualifica: 5 minuti miglior giro', '• Finale: 8 minuti su pista RCP', '• Telai ammessi: MR-03, MR-04, MA-030', '• Transponder IC-Tag obbligatorio', '• Recupero auto: solo commissari', '• Batterie: 4x AAA NiMH / LiFe', '• Gomme: mescola 20° / 30° / 40°', '• Motori: X-Speed / Brushless KV', '• Vietato entrare in pista!'];
    g.fillStyle = '#222'; g.font = `600 25px ${FONT}`; t.forEach((x, i) => g.fillText(x, 28, 160 + i * 50));
    g.fillStyle = '#c8141b'; g.fillRect(28, h - 70, w - 56, 6);
  }, { clamp: true });
}
export function posterOpenDay(){
  return canvasTex(512, 720, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff6a00'); gr.addColorStop(1, '#c8141b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = -6; i < 12; i++){ g.beginPath(); g.moveTo(i * 60, h); g.lineTo(i * 60 + 300, 0); g.lineTo(i * 60 + 330, 0); g.lineTo(i * 60 + 30, h); g.fill(); }
    g.fillStyle = '#fff'; g.font = `900 92px ${FONT}`; g.fillText('OPEN', 36, 150); g.fillText('DAY', 36, 240);
    g.font = `700 32px ${FONT}`; g.fillText('Porta la tua Mini-Z in pista!', 36, 300); g.fillText('Sabato 10 ottobre', 36, 344);
    checker(g, 36, 620, 14, 2, 30);
    grain(g, w, h, 0.05);
  }, { clamp: true });
}
export function clockTex(){
  return canvasTex(256, 256, (g) => {
    g.translate(128, 128); g.fillStyle = '#f6f5f0'; g.beginPath(); g.arc(0, 0, 124, 0, 7); g.fill(); g.lineWidth = 10; g.strokeStyle = '#222'; g.stroke();
    for (let i = 0; i < 60; i++){ const a = i / 60 * Math.PI * 2; g.fillStyle = '#222'; g.save(); g.rotate(a); g.fillRect(-(i % 5 ? 1.5 : 4), -110, i % 5 ? 3 : 8, i % 5 ? 10 : 20); g.restore(); }
    g.fillStyle = '#c8141b'; g.font = `700 20px ${FONT}`; g.textAlign = 'center'; g.fillText('MINI-Z RC CLUB', 0, 50);
    g.lineCap = 'round'; g.strokeStyle = '#111'; g.lineWidth = 9; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(-0.6) * 60, Math.sin(-0.6) * 60); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(-1.9) * 92, Math.sin(-1.9) * 92); g.stroke();
    g.strokeStyle = '#c8141b'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(0.9) * 100, Math.sin(0.9) * 100); g.stroke();
  }, { clamp: true });
}
export { rr };
