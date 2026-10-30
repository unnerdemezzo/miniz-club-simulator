import * as THREE from 'three';

// Preparazione comune delle carrozzerie Hypercar .glb (auto del giocatore e avversari).
// I materiali PBR restano quelli del modello originale (colore base, texture della livrea, metallo/rugosità,
// clearcoat, emissivi, vetri): il gioco li clona soltanto, così i colori in pista sono quelli del modello 3D.

// Nodi e materiali da nascondere: cerchi sfocati, billboard dei bagliori, pulsanti e display del volante.
const HIDDEN_NODE = /RIM_BLUR|Rim_Blurred|COCKPIT_LR|STEER_LR|STEER_HR|DAMAGE|glow|LED_0|TXLAP|TXDEL|TXFUEL|LAPTIME|DELTA2|FUEL2|WIPER/i;
const HIDDEN_MATERIAL = /Rim_Blur|GLOW|TRANSPARENTE|kers_|963_|sw_|shift_lights|dials_alpha|logo_cos/i;
const SHADOW_MATERIAL = /^Body$|^main$|Tyre|RIMS|paint|carpaint|geomainbody|mat_44|exterior_mm_ext/i;

export function prepareHypercarBody(root) {
  root.traverse((node) => {
    const matName = node.material?.name || '';
    if (HIDDEN_NODE.test(node.name || '') || HIDDEN_MATERIAL.test(matName)) {
      node.visible = false;
    }
    if (!node.isMesh || !node.visible) return;
    node.castShadow = SHADOW_MATERIAL.test(matName);
    node.receiveShadow = true;
    // Clonati perché la scena del .glb è in cache e condivisa tra giocatore e avversari
    node.material = Array.isArray(node.material)
      ? node.material.map((m) => (m ? m.clone() : m))
      : node.material
        ? node.material.clone()
        : node.material;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      if (mat?.map) mat.map.anisotropy = 8;
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
