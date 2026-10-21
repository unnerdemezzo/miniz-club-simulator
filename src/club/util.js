// Utilità condivise: texture da canvas, rumore, numeri casuali ripetibili
import * as THREE from 'three';

export let MAX_ANISO = 8;
export function setAniso(n){ MAX_ANISO = n; }

export function canvasTex(w, h, draw, opt = {}){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = opt.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (opt.repeat) t.repeat.set(opt.repeat[0], opt.repeat[1]);
  t.colorSpace = opt.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}

export function rng(seed){
  return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// puntini di rumore su canvas
export function speckle(g, w, h, n, cols, size = 1.5, R = Math.random){
  for (let i = 0; i < n; i++){ g.fillStyle = cols[(R() * cols.length) | 0]; const s = 0.6 + R() * size; g.fillRect(R() * w, R() * h, s, s); }
}

// mappa di rilievo (normal map) ricavata da una funzione altezza disegnata su canvas
export function normalFromHeight(w, h, drawHeight, strength = 2, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); drawHeight(g, w, h);
  const src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), d = out.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = MAX_ANISO;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
// campana morbida centrata in c con semi-larghezza w
export const bump = (x, c, w) => { const t = clamp(1 - Math.abs(x - c) / w, 0, 1); return t * t * (3 - 2 * t); };
