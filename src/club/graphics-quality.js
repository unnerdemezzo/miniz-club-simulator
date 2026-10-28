import * as THREE from 'three';

export const GRAPHICS_PROFILES = {
  alta: { maxDpr: 1.65, maxLongEdge: 2560, maxShortEdge: 1440, shadows: true, shadowMapSize: 2048 },
  media: { maxDpr: 1.15, maxLongEdge: 1920, maxShortEdge: 1080, shadows: true, shadowMapSize: 1024 },
  bassa: { maxDpr: 0.80, maxLongEdge: 1280, maxShortEdge: 720, shadows: false, shadowMapSize: 512 }
};

export function qualityPixelRatio(quality, width, height, displayDpr) {
  const profile = GRAPHICS_PROFILES[quality] || GRAPHICS_PROFILES.alta;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return Math.max(
    0.65,
    Math.min(
      displayDpr || 1,
      profile.maxDpr,
      profile.maxLongEdge / Math.max(w, h),
      profile.maxShortEdge / Math.min(w, h)
    )
  );
}

export function createQualityComposer(renderer, scene, camera, mainLight = null) {
  let currentProfileKey = 'alta';

  // NeutralToneMapping evita la sovrasaturazione innaturale di rossi, gialli e verdi
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  function applySettings() {
    const profile = GRAPHICS_PROFILES[currentProfileKey] || GRAPHICS_PROFILES.alta;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = qualityPixelRatio(currentProfileKey, w, h, window.devicePixelRatio || 1);

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = profile.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (mainLight) {
      mainLight.castShadow = profile.shadows;
    }
  }

  applySettings();

  return {
    get quality() {
      return currentProfileKey;
    },
    setQuality(q) {
      if (q === 'high' || q === 'alta') currentProfileKey = 'alta';
      else if (q === 'medium' || q === 'media') currentProfileKey = 'media';
      else currentProfileKey = 'bassa';
      applySettings();
    },
    resize() {
      applySettings();
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {}
  };
}
