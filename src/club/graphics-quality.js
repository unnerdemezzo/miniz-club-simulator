import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Alta come Slot-Car (js/graphics-quality.js): fino alla densità reale dello schermo (Retina, telefoni, 4K), perché una
// Mini-Z vista dal palco occupa poche decine di pixel e ogni pixel in più si vede su livree e profili. Se la GPU non
// regge, la risoluzione adattiva (monitor) scende da sola fino al livello di Media. Media e Bassa restano leggere.
export const GRAPHICS_PROFILES = {
  alta: { maxDpr: 3, maxLongEdge: 3840, maxShortEdge: 2160, shadows: true, shadowMapSize: 4096, carShadowMapSize: 2048 },
  media: { maxDpr: 1.15, maxLongEdge: 1920, maxShortEdge: 1080, shadows: true, shadowMapSize: 1024, carShadowMapSize: 1024 },
  bassa: { maxDpr: 0.80, maxLongEdge: 1280, maxShortEdge: 720, shadows: false, shadowMapSize: 512, carShadowMapSize: 512 }
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

// Protezioni di Slot-Car (js/graphics-quality.js): un solo campione HDR non valido (NaN/Inf) può contaminare tutti i
// livelli del bloom o dell'AO e accendere rettangoli neri o lampeggianti su alcune GPU. Se lo shader di Three cambia
// e il punto da proteggere non c'è più, lo shader resta quello originale.
const finiteShader = `precision highp float;
bool slotInvalid(float v) {
#if __VERSION__ >= 300
 return isnan(v) || isinf(v);
#else
 return !(v >= -65504. && v <= 65504.);
#endif
}
float slotHdrChannel(float v) { return slotInvalid(v) ? 0. : clamp(v, 0., 65504.); }
vec4 slotHdrColour(vec4 v) { return vec4(slotHdrChannel(v.r), slotHdrChannel(v.g), slotHdrChannel(v.b), slotHdrChannel(v.a)); }
vec4 slotHdrSample(sampler2D image, vec2 uv) { return slotHdrColour(texture2D(image, uv)); }
`;
function stableHdrShader(source) {
  if (!/texture2D\s*\(/.test(source) || !/gl_FragColor\s*=/.test(source) || !/}\s*$/.test(source)) return source;
  return finiteShader + source.replace(/\btexture2D\s*\(/g, 'slotHdrSample(').replace(/}\s*$/, 'gl_FragColor = slotHdrColour(gl_FragColor);\n}');
}
function stableGtaoShader(source) {
  const horizon = 'vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);';
  if (!source.includes(horizon)) return source;
  return `vec3 slotSafeNormalize(vec3 v) {
    return v * inversesqrt(max(dot(v, v), 1e-12));
  }\n` + source.replace(/\bnormalize\(/g, 'slotSafeNormalize(').replace(horizon,
    `cosHorizons = clamp(cosHorizons, vec2(-1.), vec2(1.));\n\t\t\t\t${horizon}`);
}

// Effetti fotografici di Slot-Car: Media e Alta con bloom leggero sulle plafoniere, Alta anche con occlusione ambientale
// di contatto (GTAO). Bassa disegna direttamente. Niente profondità di campo: tutto resta a fuoco mentre si guida.
function buildEffects(renderer, scene, camera, quality, width, height, dpr) {
  if (quality === 'bassa') return null;
  const pixels = width * height * dpr * dpr;
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    type: THREE.HalfFloatType,
    samples: pixels > 2.5e6 ? 2 : 4
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'alta') {
    const ao = new GTAOPass(scene, camera, width, height);
    ao.gtaoMaterial.fragmentShader = stableGtaoShader(ao.gtaoMaterial.fragmentShader);
    ao.updateGtaoMaterial({ radius: 0.04, distanceExponent: 1.5, thickness: 0.5, scale: 1.2, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 0.55;
    composer.addPass(ao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.4, 1.2);
  for (const material of [bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial]) {
    material.fragmentShader = stableHdrShader(material.fragmentShader);
  }
  composer.addPass(bloom);
  const output = new OutputPass();
  output.material.fragmentShader = stableHdrShader(output.material.fragmentShader);
  composer.addPass(output);
  return composer;
}

function disposeEffects(composer) {
  if (!composer) return;
  for (const pass of composer.passes) {
    pass.dispose?.();
    if (pass instanceof GTAOPass) pass.blendMaterial?.dispose();
  }
  composer.dispose();
}

export function createQualityComposer(renderer, scene, camera, mainLight = null, extraShadowLights = []) {
  let currentProfileKey = 'alta';

  let effects = null;
  let effectsKey = '';
  // Frazione della risoluzione di Alta in uso (1 = piena); il minimo è la risoluzione di Media
  let resolutionScale = 1;
  let resolutionFloor = 1;
  const fpsWindow = { warm: 0, seconds: 0, frames: 0, last: 0 };

  // Tonalità, saturazione e luminosità come Slot-Car: curva ACES Filmic con esposizione 1,0
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  function applySettings() {
    const profile = GRAPHICS_PROFILES[currentProfileKey] || GRAPHICS_PROFILES.alta;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const displayDpr = window.devicePixelRatio || 1;
    const fullDpr = qualityPixelRatio(currentProfileKey, w, h, displayDpr);
    resolutionFloor = currentProfileKey === 'alta' ? Math.min(1, qualityPixelRatio('media', w, h, displayDpr) / fullDpr) : 1;
    resolutionScale = Math.max(resolutionFloor, Math.min(1, resolutionScale));
    const dpr = fullDpr * resolutionScale;

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = profile.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (mainLight) {
      mainLight.castShadow = profile.shadows;
      setShadowMapSize(mainLight, profile.shadowMapSize);
    }
    for (const light of extraShadowLights) {
      light.castShadow = profile.shadows;
      setShadowMapSize(light, profile.carShadowMapSize);
    }

    // Il compositore si ricrea solo quando cambia la qualità; per il resto basta ridimensionarlo
    if (effectsKey !== currentProfileKey) {
      disposeEffects(effects);
      effects = buildEffects(renderer, scene, camera, currentProfileKey, w, h, dpr);
      effectsKey = currentProfileKey;
    } else if (effects) {
      // Come Slot-Car: oltre 2,5 milioni di pixel bastano 2 campioni MSAA invece di 4
      const samples = w * h * dpr * dpr > 2.5e6 ? 2 : 4;
      for (const target of [effects.renderTarget1, effects.renderTarget2]) {
        if (target.samples !== samples) {
          target.samples = samples;
          target.dispose();
        }
      }
      effects.setPixelRatio(dpr);
      effects.setSize(w, h);
    }
  }

  // La dimensione del profilo era dichiarata ma mai applicata: cambiarla richiede di buttare la mappa già allocata
  function setShadowMapSize(light, size) {
    if (!size || light.shadow.mapSize.x === size) return;
    light.shadow.mapSize.set(size, size);
    if (light.shadow.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
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
      resolutionScale = 1;
      fpsWindow.warm = fpsWindow.seconds = fpsWindow.frames = 0;
      applySettings();
    },
    // Come AdaptiveResolution di Slot-Car, semplificata: conta solo i fotogrammi di gara, aspetta 3 s di
    // assestamento, poi ogni 5 s sotto i 28 FPS riduce la risoluzione del 15% (mai sotto quella di Media)
    monitor(now, racing) {
      const dt = fpsWindow.last ? (now - fpsWindow.last) / 1000 : 0;
      fpsWindow.last = now;
      if (!racing || !(dt > 0) || dt > 1 || resolutionScale <= resolutionFloor + 1e-3) {
        fpsWindow.warm = fpsWindow.seconds = fpsWindow.frames = 0;
        return;
      }
      if ((fpsWindow.warm += dt) < 3) return;
      fpsWindow.seconds += dt;
      fpsWindow.frames++;
      if (fpsWindow.seconds < 5) return;
      const fps = fpsWindow.frames / fpsWindow.seconds;
      fpsWindow.seconds = fpsWindow.frames = 0;
      if (fps < 28) {
        resolutionScale = Math.max(resolutionFloor, resolutionScale * 0.85);
        fpsWindow.warm = 0;
        applySettings();
      }
    },
    resize() {
      applySettings();
    },
    render() {
      if (effects) effects.render();
      else renderer.render(scene, camera);
    },
    dispose() {
      disposeEffects(effects);
      effects = null;
      effectsKey = '';
    }
  };
}
