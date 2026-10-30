import * as THREE from 'three';
import { MAX_ANISO } from '../club/util.js';

// Preparazione comune delle carrozzerie Hypercar .glb (auto del giocatore e avversari).
// I materiali PBR restano quelli del modello originale (colore base, texture della livrea, metallo/rugosità,
// clearcoat, emissivi, vetri): il gioco li clona soltanto, così i colori in pista sono quelli del modello 3D.

// Nodi e materiali da nascondere: cerchi sfocati, billboard dei bagliori, pulsanti e display del volante.
const HIDDEN_NODE = /RIM_BLUR|Rim_Blurred|COCKPIT_LR|STEER_LR|STEER_HR|DAMAGE|glow|LED_0|TXLAP|TXDEL|TXFUEL|LAPTIME|DELTA2|FUEL2|WIPER/i;
const HIDDEN_MATERIAL = /Rim_Blur|GLOW|TRANSPARENTE|kers_|963_|sw_|shift_lights|dials_alpha|logo_cos/i;
const SHADOW_MATERIAL = /^Body$|^main$|Tyre|RIMS|paint|carpaint|geomainbody|mat_44|exterior_mm_ext/i;

const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap',
  'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'specularColorMap', 'specularIntensityMap'
];

// Le GT3 arrivano da Slot-Car già pulite (solo il livello di dettaglio vicino, niente helper): si mostra tutto,
// perché i filtri qui sopra, pensati per le Hypercar, nasconderebbero adesivi e vetri (es. "stickers_", "TRANSPARENTE").
export function prepareHypercarBody(root, { keepAllParts = false } = {}) {
  root.traverse((node) => {
    const matName = node.material?.name || '';
    if (!keepAllParts && (HIDDEN_NODE.test(node.name || '') || HIDDEN_MATERIAL.test(matName))) {
      node.visible = false;
    }
    if (!node.isMesh || !node.visible) return;
    node.castShadow = keepAllParts || SHADOW_MATERIAL.test(matName);
    node.receiveShadow = true;
    // Clonati perché la scena del .glb è in cache e condivisa tra giocatore e avversari
    node.material = Array.isArray(node.material)
      ? node.material.map((m) => (m ? m.clone() : m))
      : node.material
        ? node.material.clone()
        : node.material;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    // Filtro anisotropico al massimo della GPU su tutte le mappe (colore, rilievo, rugosità, trasparente...):
    // dal palco la carrozzeria si vede di sbieco e le mappe senza filtro si impastano
    for (const mat of mats) {
      if (!mat) continue;
      for (const slot of TEXTURE_SLOTS) {
        const tex = mat[slot];
        if (tex && tex.anisotropy !== MAX_ANISO) {
          tex.anisotropy = MAX_ANISO;
          tex.needsUpdate = true;
        }
      }
    }
  });
  return root;
}

// Box dei soli mesh visibili (anche negli antenati), per scalare e appoggiare la carrozzeria a terra.
export function visibleMeshBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((node) => {
    if (!node.isMesh || !node.visible) return;
    for (let p = node.parent; p; p = p.parent) if (!p.visible) return;
    box.expandByObject(node);
  });
  return box;
}

// Centri degli assi anteriore e posteriore (media delle due ruote) dai nodi ruota del modello .glb, in coordinate mondo
const GLB_WHEEL_NAMES = {
  lf: /^(WHEEL_LF(_\d+)?|WheelFL)$/i,
  rf: /^(WHEEL_RF(_\d+)?|WheelFR)$/i,
  lr: /^(WHEEL_LR(_\d+)?|WheelRL)$/i,
  rr: /^(WHEEL_RR(_\d+)?|WheelRR)$/i
};
export function glbAxleCenters(root) {
  root.updateMatrixWorld(true);
  const centers = {};
  root.traverse((node) => {
    for (const [key, re] of Object.entries(GLB_WHEEL_NAMES)) {
      if (!centers[key] && re.test(node.name || '')) {
        const box = new THREE.Box3().setFromObject(node);
        if (!box.isEmpty()) centers[key] = box.getCenter(new THREE.Vector3());
      }
    }
  });
  if (!centers.lf || !centers.rf || !centers.lr || !centers.rr) return null;
  return {
    front: centers.lf.clone().add(centers.rf).multiplyScalar(0.5),
    rear: centers.lr.clone().add(centers.rr).multiplyScalar(0.5)
  };
}
