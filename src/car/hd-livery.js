import * as THREE from 'three';
import { MAX_ANISO } from '../club/util.js';

// Livree ad alta risoluzione (2048 px) ricavate dai modelli originali dove il .glb in gioco le ha ridotte a 1024
// (originali: Alpine 2048, BMW e Aston Martin 4096). Si scaricano solo in qualità Alta, dopo il .glb, e sostituiscono
// la sola mappa colore della carrozzeria: stessi colori e stesse UV, solo più dettaglio su numeri e loghi.
const HD_LIVERIES = {
  '/models/alpine_a424.glb': { material: 'mat_44.001', url: '/models/hd/alpine_a424-livrea.webp' },
  '/models/bmw_m_hybrid_v8.glb': { material: 'bmwv8_paint', url: '/models/hd/bmw_m_hybrid_v8-livrea.webp' },
  '/models/aston_martin_valkyrie.glb': { material: 'EXT_CARPAINT', url: '/models/hd/aston_martin_valkyrie-livrea.webp' }
};

const images = new Map();
const hdTextures = new Map();
// Materiali delle carrozzerie in pista (giocatore e avversari): WeakRef perché le auto si ricostruiscono
const tracked = new Set();
let hdEnabled = true;

function loadImage(url) {
  if (!images.has(url)) {
    images.set(url, new THREE.ImageLoader().loadAsync(url).catch((err) => {
      images.delete(url);
      throw err;
    }));
  }
  return images.get(url);
}

function apply(record) {
  const material = record.ref.deref();
  if (!material) {
    tracked.delete(record);
    return;
  }
  const hd = hdEnabled ? hdTextures.get(record.url) : null;
  const next = hd || record.base;
  if (material.map !== next) {
    material.map = next;
    material.needsUpdate = true;
  }
}

function ensureHd(record) {
  if (!hdEnabled || hdTextures.has(record.url)) return;
  loadImage(record.url).then((image) => {
    if (!hdTextures.has(record.url)) {
      // Clone della texture del .glb: stessi flipY, wrap e spazio colore, cambia solo l'immagine
      const tex = record.base.clone();
      tex.source = new THREE.Source(image);
      tex.anisotropy = MAX_ANISO;
      tex.needsUpdate = true;
      hdTextures.set(record.url, tex);
    }
    for (const r of [...tracked]) if (r.url === record.url) apply(r);
  }, () => {});
}

// Da chiamare dopo prepareHypercarBody (i materiali devono essere già clonati per questa auto)
export function trackHdLivery(root, glbUrl) {
  const spec = HD_LIVERIES[glbUrl];
  if (!spec) return;
  root.traverse((node) => {
    if (!node.isMesh) return;
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      if (mat?.name !== spec.material || !mat.map) continue;
      const record = { ref: new WeakRef(mat), base: mat.map, url: spec.url };
      tracked.add(record);
      apply(record);
      ensureHd(record);
    }
  });
}

// Alta: livree HD; Media e Bassa tornano alla texture del .glb (meno memoria video sul telefono)
export function setHdLiveryQuality(enabled) {
  hdEnabled = enabled;
  for (const record of [...tracked]) {
    apply(record);
    ensureHd(record);
  }
}
